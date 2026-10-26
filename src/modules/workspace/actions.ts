"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { errorState, successState, zodFieldErrors, type ActionState } from "@/lib/action-state";
import { todayInTimezone } from "@/lib/dates";
import { assertSameOrigin } from "@/server/dal/request";
import { requireSessionHash } from "@/server/dal/session";
import { runWithSession } from "@/server/dal/context";
import { toUserMessage } from "@/server/errors";
import { createInvitation, revokeInvitation as revokeInvitationService } from "@/server/services/auth";
import { applyTemplatePreset } from "@/server/services/templates";
import {
  createWorkspace,
  isTemplateCode,
  setMembership,
  setWorkspaceArchived,
  transferOwner,
  updateWorkspaceSettings,
} from "@/server/services/workspaces";

const createSchema = z.object({
  name: z.string().min(1, "Nama workspace wajib diisi.").max(160),
  timezone: z.string().min(1, "Zona waktu wajib diisi."),
  template: z.string().min(1, "Template wajib dipilih."),
});

export async function createWorkspaceAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errorState("Periksa kembali data yang dimasukkan.", zodFieldErrors(parsed.error.issues));
  const template = parsed.data.template;
  if (!isTemplateCode(template)) return errorState("Template tidak dikenal.");

  let workspaceId: string;
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    workspaceId = await runWithSession({ sessionHash }, async (tx) => {
      const id = await createWorkspace(tx, {
        name: parsed.data.name,
        timezone: parsed.data.timezone,
        template,
      });
      await applyTemplatePreset(tx, id, template, todayInTimezone(parsed.data.timezone));
      return id;
    });
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  redirect(`/w/${workspaceId}/dashboard`);
}

export async function updateWorkspaceSettingsAction(
  _prev: ActionState = { status: "idle" },
  formData: FormData,
): Promise<ActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    if (!name) return errorState("Nama workspace wajib diisi.", { name: "Nama workspace wajib diisi." });
    await runWithSession({ sessionHash, workspaceId }, async (tx) => {
      await updateWorkspaceSettings(tx, workspaceId, { name, timezone });
    });
    revalidatePath(`/w/${workspaceId}/settings`);
    revalidatePath(`/w/${workspaceId}/dashboard`);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState("Pengaturan workspace disimpan.");
}

export async function archiveWorkspaceAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const archived = String(formData.get("archived") ?? "false") === "true";
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    await runWithSession({ sessionHash, workspaceId }, async (tx) => {
      await setWorkspaceArchived(tx, workspaceId, archived);
    });
    revalidatePath(`/w/${workspaceId}/settings`);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState(archived ? "Workspace diarsipkan." : "Workspace diaktifkan kembali.");
}

export async function createInvitationAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "finance");
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return errorState("Email undangan tidak valid.", { email: "Email undangan tidak valid." });
    }
    const result = await createInvitation({
      sessionHash,
      workspaceId,
      email,
      role: role as "admin" | "finance" | "cashier" | "viewer",
    });
    revalidatePath(`/w/${workspaceId}/members`);
    return successState(`Tautan undangan dibuat. Bagikan tautan berikut (berlaku 72 jam): /register?token=${result.token}`);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
}

export async function revokeInvitationAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const invitationId = String(formData.get("invitationId") ?? "");
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    await revokeInvitationService({ sessionHash, workspaceId, invitationId });
    revalidatePath(`/w/${workspaceId}/members`);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState("Undangan dicabut.");
}

export async function setMembershipAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "viewer");
  const status = String(formData.get("status") ?? "active");
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    if (!["owner", "admin", "finance", "cashier", "viewer"].includes(role)) {
      return errorState("Peran tidak valid.");
    }
    if (!["active", "disabled"].includes(status)) return errorState("Status tidak valid.");
    await runWithSession({ sessionHash, workspaceId }, async (tx) => {
      await setMembership(tx, workspaceId, userId, role as "owner" | "admin" | "finance" | "cashier" | "viewer", status as "active" | "disabled");
    });
    revalidatePath(`/w/${workspaceId}/members`);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState("Keanggotaan diperbarui.");
}

export async function transferOwnerAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const newOwnerId = String(formData.get("newOwnerId") ?? "");
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    await runWithSession({ sessionHash, workspaceId }, async (tx) => {
      await transferOwner(tx, workspaceId, newOwnerId);
    });
    revalidatePath(`/w/${workspaceId}/members`);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState("Kepemilikan workspace dialihkan.");
}


