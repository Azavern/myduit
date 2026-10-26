"use client";

import { useActionState, useMemo, useState } from "react";

import { useRequestKey } from "@/components/app/request-key";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { IDLE_STATE } from "@/lib/action-state";
import { injectRequestKey } from "@/lib/idempotency";
import { createTransactionAction, createTransferAction } from "@/modules/cash/actions";

export type Option = { id: string; name: string };

function Feedback({ status, message }: { status: "idle" | "error" | "success"; message?: string }) {
  if (!message || status === "idle") return null;
  return (
    <p
      role={status === "error" ? "alert" : "status"}
      className={
        status === "error"
          ? "sm:col-span-2 rounded-lg border border-rose-200 bg-danger-surface px-3 py-2 text-sm text-danger"
          : "sm:col-span-2 rounded-lg border border-emerald-200 bg-success-surface px-3 py-2 text-sm text-success"
      }
    >
      {message}
    </p>
  );
}

export function TransactionForm({
  workspaceId,
  kind,
  categories,
  accounts,
  methods,
  today,
}: {
  workspaceId: string;
  kind: "income" | "expense";
  categories: Option[];
  accounts: Option[];
  methods: Option[];
  today: string;
}) {
  const [state, action, pending] = useActionState(createTransactionAction, IDLE_STATE);
  const [businessDate, setBusinessDate] = useState(today);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const payloadJson = useMemo(
    () =>
      JSON.stringify({
        kind,
        businessDate,
        categoryId,
        cashAccountId: accountId,
        paymentMethodId: methodId || null,
        amount: amount || "0",
        description,
        counterparty: counterparty || null,
        reference: reference || null,
        notes: notes || null,
        requestKey: "",
      }),
    [kind, businessDate, categoryId, accountId, methodId, amount, description, counterparty, reference, notes],
  );
  const requestKey = useRequestKey(payloadJson);
  const finalPayload = injectRequestKey(payloadJson, requestKey);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="payload" value={finalPayload} />
      <Feedback status={state.status} message={state.message} />

      <Field label="Jenis" htmlFor={`kind-${kind}`}>
        <Input id={`kind-${kind}`} value={kind === "income" ? "Pemasukan" : "Pengeluaran"} readOnly />
      </Field>
      <Field label="Tanggal" htmlFor={`tdate-${kind}`}>
        <Input id={`tdate-${kind}`} type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} />
      </Field>
      <Field label="Kategori" htmlFor={`tcat-${kind}`}>
        <Select id={`tcat-${kind}`} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          {categories.length === 0 ? <option value="">Belum ada kategori</option> : null}
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Akun kas" htmlFor={`tacc-${kind}`}>
        <Select id={`tacc-${kind}`} value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Nominal" htmlFor={`tamount-${kind}`}>
        <Input id={`tamount-${kind}`} inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" />
      </Field>
      <Field label="Metode pembayaran" htmlFor={`tmethod-${kind}`}>
        <Select id={`tmethod-${kind}`} value={methodId} onChange={(event) => setMethodId(event.target.value)}>
          <option value="">— Tanpa metode —</option>
          {methods.map((method) => (
            <option key={method.id} value={method.id}>
              {method.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Deskripsi" htmlFor={`tdesc-${kind}`} className="sm:col-span-2">
        <Input id={`tdesc-${kind}`} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
      </Field>
      <Field label="Penerima/pemberi (opsional)" htmlFor={`tcp-${kind}`}>
        <Input id={`tcp-${kind}`} value={counterparty} onChange={(event) => setCounterparty(event.target.value)} maxLength={200} />
      </Field>
      <Field label="Referensi (opsional)" htmlFor={`tref-${kind}`}>
        <Input id={`tref-${kind}`} value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} />
      </Field>
      <Field label="Catatan (opsional)" htmlFor={`tnotes-${kind}`} className="sm:col-span-2">
        <Textarea id={`tnotes-${kind}`} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending} disabled={!categoryId || !accountId}>
          Simpan transaksi
        </Button>
      </div>
      <p className="sm:col-span-2 text-xs text-ink-subtle">
        Penerimaan pembayaran tagihan dicatat lewat menu Pembayaran dan tidak boleh dicatat lagi sebagai pemasukan umum.
      </p>
    </form>
  );
}

export function TransferForm({
  workspaceId,
  accounts,
  expenseCategories,
  today,
}: {
  workspaceId: string;
  accounts: Option[];
  expenseCategories: Option[];
  today: string;
}) {
  const [state, action, pending] = useActionState(createTransferAction, IDLE_STATE);
  const [businessDate, setBusinessDate] = useState(today);
  const [sourceId, setSourceId] = useState(accounts[0]?.id ?? "");
  const [destinationId, setDestinationId] = useState(accounts[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("0");
  const [feeCategoryId, setFeeCategoryId] = useState(expenseCategories[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const payloadJson = useMemo(
    () =>
      JSON.stringify({
        businessDate,
        sourceAccountId: sourceId,
        destinationAccountId: destinationId,
        amount: amount || "0",
        fee: fee || "0",
        feeCategoryId: feeCategoryId || null,
        reference: reference || null,
        notes: notes || null,
        requestKey: "",
      }),
    [businessDate, sourceId, destinationId, amount, fee, feeCategoryId, reference, notes],
  );
  const requestKey = useRequestKey(payloadJson);
  const finalPayload = injectRequestKey(payloadJson, requestKey);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="payload" value={finalPayload} />
      <Feedback status={state.status} message={state.message} />

      <Field label="Tanggal" htmlFor="trDate">
        <Input id="trDate" type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} />
      </Field>
      <Field label="Nominal" htmlFor="trAmount">
        <Input id="trAmount" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" />
      </Field>
      <Field label="Akun sumber" htmlFor="trSource">
        <Select id="trSource" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Akun tujuan" htmlFor="trDestination">
        <Select id="trDestination" value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Biaya transfer (opsional)" htmlFor="trFee" hint="Biaya dicatat sebagai pengeluaran tersendiri.">
        <Input id="trFee" inputMode="numeric" value={fee} onChange={(event) => setFee(event.target.value)} />
      </Field>
      <Field label="Kategori biaya" htmlFor="trFeeCategory">
        <Select id="trFeeCategory" value={feeCategoryId} onChange={(event) => setFeeCategoryId(event.target.value)}>
          {expenseCategories.length === 0 ? <option value="">Belum ada kategori pengeluaran</option> : null}
          {expenseCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Referensi (opsional)" htmlFor="trReference">
        <Input id="trReference" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} />
      </Field>
      <Field label="Catatan (opsional)" htmlFor="trNotes">
        <Input id="trNotes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending} disabled={sourceId === destinationId}>
          Simpan transfer
        </Button>
      </div>
      <p className="sm:col-span-2 text-xs text-ink-subtle">
        Transfer tidak dihitung sebagai pemasukan atau pengeluaran operasional; hanya perpindahan antar akun.
      </p>
    </form>
  );
}
