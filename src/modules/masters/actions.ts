"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { errorState, successState, zodFieldErrors, type ActionState } from "@/lib/action-state";
import { isValidDateString, todayInTimezone } from "@/lib/dates";
import { normalizeQuantity, parseIDRInputAllowZero } from "@/lib/money";
import { runWithSession } from "@/server/dal/context";
import { assertSameOrigin } from "@/server/dal/request";
import { requireSessionHash } from "@/server/dal/session";
import { toUserMessage } from "@/server/errors";
import {
  createCashAccount,
  createCategory,
  createCustomer,
  createPaymentMethod,
  createProduct,
  setCashAccountActive,
  setPaymentMethodActive,
  setProductActive,
  updateCategory,
  updateCustomer,
  updateProduct,
} from "@/server/services/masters";
import { getWorkspaceTimezone } from "@/server/services/workspaces";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function revalidateMasters(workspaceId: string) {
  revalidatePath(`/w/${workspaceId}/categories`);
  revalidatePath(`/w/${workspaceId}/customers`);
  revalidatePath(`/w/${workspaceId}/products`);
  revalidatePath(`/w/${workspaceId}/cash-accounts`);
}

/* ---------------------------- Kategori ---------------------------- */

const categorySchema = z.object({
  name: z.string().min(1, "Nama kategori wajib diisi.").max(120),
  kind: z.enum(["sale", "income", "expense"]),
  code: z.string().max(40).optional(),
  color: z.string().max(20).optional(),
});

export async function saveCategoryAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = str(formData, "workspaceId");
  const categoryId = str(formData, "categoryId");
  const parsed = categorySchema.safeParse({
    name: str(formData, "name"),
    kind: str(formData, "kind"),
    code: str(formData, "code") || undefined,
    color: str(formData, "color") || undefined,
  });
  if (!parsed.success) return errorState("Periksa kembali data kategori.", zodFieldErrors(parsed.error.issues));
  const active = formData.get("active") === "on" || formData.get("active") === "true";
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    await runWithSession({ sessionHash, workspaceId }, async (tx) => {
      if (categoryId) {
        await updateCategory(tx, workspaceId, categoryId, {
          name: parsed.data.name,
          code: parsed.data.code ?? null,
          color: parsed.data.color ?? null,
          active,
        });
      } else {
        await createCategory(tx, workspaceId, {
          name: parsed.data.name,
          kind: parsed.data.kind,
          code: parsed.data.code ?? null,
          color: parsed.data.color ?? null,
        });
      }
    });
    revalidateMasters(workspaceId);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState("Kategori disimpan.");
}

const paymentMethodSchema = z.object({
  name: z.string().min(1, "Nama metode wajib diisi.").max(80),
  code: z.string().min(1, "Kode metode wajib diisi.").max(40),
});

export async function savePaymentMethodAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = str(formData, "workspaceId");
  const parsed = paymentMethodSchema.safeParse({ name: str(formData, "name"), code: str(formData, "code") });
  if (!parsed.success) return errorState("Periksa kembali data metode.", zodFieldErrors(parsed.error.issues));
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    await runWithSession({ sessionHash, workspaceId }, async (tx) => {
      await createPaymentMethod(tx, workspaceId, parsed.data);
    });
    revalidateMasters(workspaceId);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState("Metode pembayaran ditambahkan.");
}

export async function togglePaymentMethodAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = str(formData, "workspaceId");
  const methodId = str(formData, "methodId");
  const active = str(formData, "active") === "true";
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    await runWithSession({ sessionHash, workspaceId }, async (tx) => {
      await setPaymentMethodActive(tx, workspaceId, methodId, active);
    });
    revalidateMasters(workspaceId);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState(active ? "Metode diaktifkan." : "Metode dinonaktifkan.");
}

/* ---------------------------- Pelanggan ---------------------------- */

const customerSchema = z.object({
  name: z.string().min(1, "Nama pelanggan wajib diisi.").max(160),
  phone: z.string().max(40).optional(),
  email: z.string().max(254).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

export async function saveCustomerAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = str(formData, "workspaceId");
  const customerId = str(formData, "customerId");
  const parsed = customerSchema.safeParse({
    name: str(formData, "name"),
    phone: str(formData, "phone") || undefined,
    email: str(formData, "email") || undefined,
    address: str(formData, "address") || undefined,
    notes: str(formData, "notes") || undefined,
  });
  if (!parsed.success) return errorState("Periksa kembali data pelanggan.", zodFieldErrors(parsed.error.issues));
  const active = formData.get("active") !== "false";
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    await runWithSession({ sessionHash, workspaceId }, async (tx) => {
      if (customerId) {
        await updateCustomer(tx, workspaceId, customerId, {
          name: parsed.data.name,
          phone: parsed.data.phone ?? null,
          email: parsed.data.email ?? null,
          address: parsed.data.address ?? null,
          notes: parsed.data.notes ?? null,
          active,
        });
      } else {
        await createCustomer(tx, workspaceId, {
          name: parsed.data.name,
          phone: parsed.data.phone ?? null,
          email: parsed.data.email ?? null,
          address: parsed.data.address ?? null,
          notes: parsed.data.notes ?? null,
        });
      }
    });
    revalidateMasters(workspaceId);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState("Data pelanggan disimpan.");
}

/* ------------------------------ Produk ----------------------------- */

export async function saveProductAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = str(formData, "workspaceId");
  const productId = str(formData, "productId");
  const name = str(formData, "name");
  const sku = str(formData, "sku");
  const productKindRaw = str(formData, "productKind");
  const baseUnit = str(formData, "baseUnit");
  const basePrice = parseIDRInputAllowZero(str(formData, "basePrice"));
  const description = str(formData, "description");

  if (!name) return errorState("Nama produk wajib diisi.", { name: "Nama produk wajib diisi." });
  if (!baseUnit) return errorState("Satuan dasar wajib diisi.", { baseUnit: "Satuan dasar wajib diisi." });
  if (!["goods", "service"].includes(productKindRaw)) return errorState("Tipe produk tidak valid.");
  if (basePrice === null) return errorState("Harga satuan dasar tidak valid.", { basePrice: "Harga tidak valid." });

  const unitNames = formData.getAll("unitName").map(String);
  const unitFactors = formData.getAll("unitFactor").map(String);
  const unitPrices = formData.getAll("unitPrice").map(String);
  const unitActives = formData.getAll("unitActive").map(String);
  const units: { name: string; conversionFactor: string; price: bigint; active: boolean }[] = [];
  for (let index = 0; index < unitNames.length; index += 1) {
    const unitName = (unitNames[index] ?? "").trim();
    if (!unitName) continue;
    const factorRaw = (unitFactors[index] ?? "").trim();
    const price = parseIDRInputAllowZero(unitPrices[index] ?? "");
    if (!factorRaw || Number.isNaN(Number(factorRaw)) || Number(factorRaw) <= 0) {
      return errorState(`Konversi satuan "${unitName}" harus berupa angka lebih dari nol.`);
    }
    if (price === null) return errorState(`Harga satuan "${unitName}" tidak valid.`);
    units.push({ name: unitName, conversionFactor: normalizeQuantity(factorRaw), price, active: (unitActives[index] ?? "true") !== "false" });
  }

  const active = formData.get("active") !== "false";
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    await runWithSession({ sessionHash, workspaceId }, async (tx) => {
      const input = {
        name,
        sku: sku || null,
        productKind: productKindRaw as "goods" | "service",
        baseUnit,
        basePrice,
        description: description || null,
        units,
        active,
      };
      if (productId) {
        await updateProduct(tx, workspaceId, productId, input);
      } else {
        await createProduct(tx, workspaceId, input);
      }
    });
    revalidateMasters(workspaceId);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState("Produk disimpan.");
}

export async function toggleProductAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = str(formData, "workspaceId");
  const productId = str(formData, "productId");
  const active = str(formData, "active") === "true";
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    await runWithSession({ sessionHash, workspaceId }, async (tx) => {
      await setProductActive(tx, workspaceId, productId, active);
    });
    revalidateMasters(workspaceId);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState(active ? "Produk diaktifkan." : "Produk dinonaktifkan.");
}

/* ---------------------------- Akun kas ----------------------------- */

export async function createCashAccountAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = str(formData, "workspaceId");
  const name = str(formData, "name");
  const kind = str(formData, "kind");
  const openingDateRaw = str(formData, "openingDate");
  const openingBalance = parseIDRInputAllowZero(str(formData, "openingBalance") || "0");
  const reference = str(formData, "reference");
  const notes = str(formData, "notes");

  if (!name) return errorState("Nama akun wajib diisi.", { name: "Nama akun wajib diisi." });
  if (!["cash", "bank", "ewallet", "other"].includes(kind)) return errorState("Tipe akun tidak valid.");
  if (openingBalance === null) return errorState("Saldo awal tidak valid.", { openingBalance: "Saldo awal tidak valid." });

  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    await runWithSession({ sessionHash, workspaceId }, async (tx) => {
      const timezone = await getWorkspaceTimezone(tx, workspaceId);
      const today = todayInTimezone(timezone);
      const openingDate = isValidDateString(openingDateRaw) ? openingDateRaw : today;
      await createCashAccount(tx, workspaceId, {
        name,
        kind: kind as "cash" | "bank" | "ewallet" | "other",
        openingDate,
        openingBalance,
        reference: reference || null,
        notes: notes || null,
      });
    });
    revalidateMasters(workspaceId);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState("Akun kas dibuat dengan satu saldo awal.");
}

export async function toggleCashAccountAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = str(formData, "workspaceId");
  const accountId = str(formData, "accountId");
  const active = str(formData, "active") === "true";
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    await runWithSession({ sessionHash, workspaceId }, async (tx) => {
      await setCashAccountActive(tx, workspaceId, accountId, active);
    });
    revalidateMasters(workspaceId);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState(active ? "Akun diaktifkan." : "Akun dinonaktifkan.");
}
