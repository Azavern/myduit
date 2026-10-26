import { PageHeader } from "@/components/app/page-header";
import { InviteMemberForm, MemberRoleForm, RevokeInvitationForm, TransferOwnerForm } from "@/components/app/member-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/table";
import { formatDateTimeID } from "@/lib/dates";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/permissions";
import { loadWorkspace } from "@/server/dal/page";
import { listInvitationLifecycle, listMembers } from "@/server/services/workspaces";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anggota" };

export default async function MembersPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;

  const { context, data } = await loadWorkspace(workspaceId, async (tx) => {
    const [members, invitations] = await Promise.all([
      listMembers(tx, workspaceId),
      listInvitationLifecycle(tx, workspaceId),
    ]);
    return { members, invitations };
  });

  const isOwner = context.role === "owner";
  const isAdmin = context.role === "admin";
  const transferCandidates = data.members
    .filter((member) => member.user_id !== context.actorId && member.status === "active" && member.role !== "owner")
    .map((member) => ({ userId: member.user_id, displayName: member.display_name }));

  return (
    <>
      <PageHeader
        title="Anggota & Izin"
        description="Hak akses selalu diperiksa di server. Menyembunyikan tombol bukan pengganti pemeriksaan izin."
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Anggota workspace</CardTitle>
          <span className="text-xs text-ink-subtle">Owner tidak dapat dinonaktifkan tanpa transfer kepemilikan</span>
        </CardHeader>
        <CardBody className="px-0 py-0">
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Nama</Th>
                  <Th>Peran</Th>
                  <Th>Status</Th>
                  <Th>Ubah</Th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((member) => (
                  <Tr key={member.user_id}>
                    <Td>
                      <span className="font-medium text-ink">{member.display_name}</span>
                      {member.user_id === context.actorId ? <span className="ml-2 text-xs text-ink-subtle">(Anda)</span> : null}
                      <span className="block text-xs text-ink-subtle">{ROLE_DESCRIPTIONS[member.role]}</span>
                    </Td>
                    <Td>
                      <Badge tone={member.role === "owner" ? "brand" : "neutral"}>{ROLE_LABELS[member.role]}</Badge>
                    </Td>
                    <Td>
                      <Badge tone={member.status === "active" ? "positive" : "warning"}>
                        {member.status === "active" ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </Td>
                    <Td>
                      <MemberRoleForm
                        workspaceId={workspaceId}
                        userId={member.user_id}
                        role={member.role}
                        status={member.status}
                        canManageAdmins={isOwner}
                      />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Undang anggota</CardTitle>
          </CardHeader>
          <CardBody>
            <InviteMemberForm workspaceId={workspaceId} canAssignAdmin={isOwner} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Undangan menunggu</CardTitle>
          </CardHeader>
          <CardBody className="px-0 py-0">
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Peran diundang</Th>
                    <Th>Dibuat</Th>
                    <Th>Aksi</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.invitations.map((invitation) => (
                    <Tr key={invitation.invitationId}>
                      <Td>{ROLE_LABELS[invitation.role] ?? invitation.role}</Td>
                      <Td className="text-ink-muted">{formatDateTimeID(invitation.createdAt, context.workspace.timezone)}</Td>
                      <Td>
                        <RevokeInvitationForm workspaceId={workspaceId} invitationId={invitation.invitationId} />
                      </Td>
                    </Tr>
                  ))}
                  {data.invitations.length === 0 ? (
                    <Tr>
                      <Td className="text-ink-muted">
                        Tidak ada undangan menunggu. Daftar ini disusun dari audit trail karena undangan tersimpan di
                        schema privat.
                      </Td>
                      <Td>{null}</Td>
                      <Td>{null}</Td>
                    </Tr>
                  ) : null}
                </tbody>
              </Table>
            </TableWrap>
          </CardBody>
        </Card>
      </div>

      {isAdmin ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Transfer kepemilikan (owner saja)</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="mb-3 text-sm text-ink-muted">
              Hanya owner yang dapat memindahkan kepemilikan workspace. Admin tidak dapat mempromosikan diri sendiri
              menjadi owner.
            </p>
            {isOwner ? (
              <TransferOwnerForm workspaceId={workspaceId} candidates={transferCandidates} />
            ) : (
              <p className="text-sm text-ink-muted">Peran Anda saat ini adalah admin, sehingga kontrol ini dinonaktifkan.</p>
            )}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
