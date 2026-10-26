import { PageHeader } from "@/components/app/page-header";
import { CategoryForm, PaymentMethodForm, TogglePaymentMethodForm } from "@/components/masters/category-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/table";
import { loadWorkspace } from "@/server/dal/page";
import { listCategories, listPaymentMethods } from "@/server/services/masters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kategori & Metode" };

const KIND_LABELS: Record<string, { label: string; tone: "brand" | "positive" | "danger" }> = {
  sale: { label: "Penjualan", tone: "brand" },
  income: { label: "Pemasukan", tone: "positive" },
  expense: { label: "Pengeluaran", tone: "danger" },
};

export default async function CategoriesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;

  const { data } = await loadWorkspace(workspaceId, async (tx) => {
    const [categories, methods] = await Promise.all([
      listCategories(tx, workspaceId, {}),
      listPaymentMethods(tx, workspaceId, false),
    ]);
    return { categories, methods };
  });

  return (
    <>
      <PageHeader
        title="Kategori & Metode Pembayaran"
        description="Kategori yang sudah dipakai transaksi dinonaktifkan, bukan dihapus. Transfer antar akun bukan kategori pemasukan/pengeluaran."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kategori</CardTitle>
          </CardHeader>
          <CardBody className="px-0 py-0">
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Nama</Th>
                    <Th>Jenis</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((category) => (
                    <Tr key={category.id}>
                      <Td>{category.name}</Td>
                      <Td>
                        <Badge tone={KIND_LABELS[category.kind]?.tone ?? "neutral"}>
                          {KIND_LABELS[category.kind]?.label ?? category.kind}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge tone={category.active ? "positive" : "neutral"}>
                          {category.active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </Td>
                    </Tr>
                  ))}
                  {data.categories.length === 0 ? (
                    <Tr>
                      <Td className="text-ink-muted">Belum ada kategori.</Td>
                      <Td>{null}</Td>
                      <Td>{null}</Td>
                    </Tr>
                  ) : null}
                </tbody>
              </Table>
            </TableWrap>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Metode pembayaran</CardTitle>
          </CardHeader>
          <CardBody className="px-0 py-0">
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Nama</Th>
                    <Th>Kode</Th>
                    <Th>Status</Th>
                    <Th>Aksi</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.methods.map((method) => (
                    <Tr key={method.id}>
                      <Td>{method.name}</Td>
                      <Td className="text-ink-muted">{method.code}</Td>
                      <Td>
                        <Badge tone={method.active ? "positive" : "neutral"}>{method.active ? "Aktif" : "Nonaktif"}</Badge>
                      </Td>
                      <Td>
                        <TogglePaymentMethodForm workspaceId={workspaceId} methodId={method.id} active={method.active} />
                      </Td>
                    </Tr>
                  ))}
                  {data.methods.length === 0 ? (
                    <Tr>
                      <Td className="text-ink-muted">Belum ada metode.</Td>
                      <Td>{null}</Td>
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

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tambah kategori</CardTitle>
          </CardHeader>
          <CardBody>
            <CategoryForm workspaceId={workspaceId} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tambah metode pembayaran</CardTitle>
          </CardHeader>
          <CardBody>
            <PaymentMethodForm workspaceId={workspaceId} />
          </CardBody>
        </Card>
      </div>

      <p className="mt-4 text-xs text-ink-subtle">
        Metode pembayaran pada prototipe ini hanya label. Aplikasi tidak memproses pembayaran melalui bank, kartu, QRIS,
        atau payment gateway.
      </p>
    </>
  );
}
