"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { LoanCard, type Loan } from "@/components/finance/LoanCard";
import { MoneyDisplay } from "@/components/finance/MoneyDisplay";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconHandshake } from "@/components/ui/Icons";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Sheet } from "@/components/ui/Sheet";
import { Tabs } from "@/components/ui/Tabs";
import { clientFetch } from "@/lib/api/client";
import { pushToast } from "@/lib/toast";

type Filter = "all" | "lender" | "borrower";

const TABS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "lender", label: "Presté" },
  { id: "borrower", label: "Me prestaron" },
];

interface HouseholdMember {
  id: string;
  display_name: string;
}

function LoanForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [lenderId, setLenderId] = useState("");
  const [borrowerId, setBorrowerId] = useState("");
  const [amount, setAmount] = useState(0);
  const [lentOn, setLentOn] = useState(new Date().toISOString().slice(0, 10));

  const members = useQuery({
    queryKey: ["household-members"],
    queryFn: () =>
      clientFetch<{ members: HouseholdMember[] }>("/households/current").then(
        (data) => data.members,
      ),
  });

  const create = useMutation({
    mutationFn: () =>
      clientFetch("/loans", {
        method: "POST",
        body: JSON.stringify({
          lender_member_id: lenderId,
          borrower_member_id: borrowerId,
          amount_minor: amount,
          lent_on: lentOn,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["loans"] });
      pushToast({ message: "Préstamo registrado", type: "success" });
      onDone();
    },
  });

  const memberOptions = members.data ?? [];

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      {/* The caller must be one of the two parties — the API enforces this,
          so both roles are picked explicitly rather than assumed. */}
      <div className="flex flex-col gap-1">
        <label htmlFor="lender" className="text-sm font-medium text-text-muted">
          Quién presta
        </label>
        <select
          id="lender"
          required
          value={lenderId}
          onChange={(event) => setLenderId(event.target.value)}
          className="min-h-[52px] rounded-xl border border-border bg-surface px-3.5 text-base"
        >
          <option value="">Selecciona…</option>
          {memberOptions.map((member) => (
            <option key={member.id} value={member.id}>
              {member.display_name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="borrower" className="text-sm font-medium text-text-muted">
          Quién recibe
        </label>
        <select
          id="borrower"
          required
          value={borrowerId}
          onChange={(event) => setBorrowerId(event.target.value)}
          className="min-h-[52px] rounded-xl border border-border bg-surface px-3.5 text-base"
        >
          <option value="">Selecciona…</option>
          {memberOptions.map((member) => (
            <option key={member.id} value={member.id}>
              {member.display_name}
            </option>
          ))}
        </select>
      </div>
      <MoneyInput label="Monto" value={amount} onChange={setAmount} currency="COP" required />
      <Input
        label="Fecha"
        type="date"
        required
        value={lentOn}
        onChange={(event) => setLentOn(event.target.value)}
      />
      {create.isError ? (
        <p role="alert" className="text-sm text-danger">
          {(create.error as Error).message}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={
          create.isPending || !lenderId || !borrowerId || lenderId === borrowerId || amount <= 0
        }
      >
        {create.isPending ? "Guardando…" : "Registrar préstamo"}
      </Button>
    </form>
  );
}

interface LoanPayment {
  id: string;
  amount_minor: number;
  paid_on: string;
}

function LoanDetail({ loan }: { loan: Loan }) {
  const queryClient = useQueryClient();
  const [payAmount, setPayAmount] = useState(0);
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const active = loan.status === "pending" || loan.status === "partially_paid";
  const canPay = loan.perspective !== "observer" && active;
  const canCancel = loan.perspective === "lender" && active;

  const detail = useQuery({
    queryKey: ["loan-detail", loan.id],
    queryFn: () => clientFetch<{ payments: LoanPayment[] }>(`/loans/${loan.id}`),
  });

  const pay = useMutation({
    mutationFn: () =>
      clientFetch(`/loans/${loan.id}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount_minor: payAmount, paid_on: paidOn }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["loans"] });
      await queryClient.invalidateQueries({ queryKey: ["loan-detail", loan.id] });
      setPayAmount(0);
      pushToast({ message: "Pago registrado", type: "success" });
    },
  });

  const cancel = useMutation({
    mutationFn: () => clientFetch(`/loans/${loan.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["loans"] });
      pushToast({ message: "Préstamo cancelado", type: "success" });
    },
  });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-sunken p-3.5">
      <div className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-muted">Prestado</span>
          <MoneyDisplay amountMinor={loan.amount_minor} currency={loan.currency} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-muted">Pendiente</span>
          <MoneyDisplay amountMinor={loan.outstanding_minor} currency={loan.currency} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-muted">Fecha del préstamo</span>
          <span>{loan.lent_on}</span>
        </div>
        {loan.due_on ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-text-muted">Vence</span>
            <span>{loan.due_on}</span>
          </div>
        ) : null}
        {loan.note ? (
          <div className="flex flex-col gap-0.5 border-t border-border pt-2">
            <span className="text-text-muted">Nota</span>
            <span>{loan.note}</span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Pagos registrados
        </span>
        {detail.isLoading ? null : detail.data?.payments.length ? (
          <ul className="flex flex-col gap-1.5">
            {detail.data.payments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between text-sm">
                <span className="text-text-muted">{payment.paid_on}</span>
                <MoneyDisplay amountMinor={payment.amount_minor} currency={loan.currency} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">Todavía no hay pagos.</p>
        )}
      </div>

      {canPay ? (
        <form
          className="flex flex-col gap-3 border-t border-border pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            pay.mutate();
          }}
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Registrar abono
          </span>
          <MoneyInput label="Monto" value={payAmount} onChange={setPayAmount} currency={loan.currency} />
          <Input
            label="Fecha"
            type="date"
            required
            value={paidOn}
            onChange={(event) => setPaidOn(event.target.value)}
          />
          {pay.isError ? (
            <p role="alert" className="text-sm text-danger">
              {(pay.error as Error).message}
            </p>
          ) : null}
          <Button type="submit" disabled={pay.isPending || payAmount <= 0}>
            {pay.isPending ? "Guardando…" : "Registrar abono"}
          </Button>
        </form>
      ) : null}

      {canCancel ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {cancel.isError ? (
            <p role="alert" className="text-sm text-danger">
              {(cancel.error as Error).message}
            </p>
          ) : null}
          {confirmingCancel ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm text-text-muted">¿Cancelar este préstamo?</span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setConfirmingCancel(false)}
              >
                No
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                Sí, cancelar
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              className="self-start text-sm font-semibold text-danger"
            >
              Cancelar préstamo
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function PrestamosPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loans = useQuery({
    queryKey: ["loans", filter],
    queryFn: () => clientFetch<Loan[]>(`/loans?role=${filter}`),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[1.75rem] font-bold tracking-tight">Préstamos</h1>
        <Button onClick={() => setSheetOpen(true)}>Registrar</Button>
      </div>

      <Tabs tabs={TABS} active={filter} onChange={(id) => setFilter(id as Filter)} />

      {loans.data?.length ? (
        <div className="flex flex-col gap-2.5">
          {loans.data.map((loan) => (
            <div key={loan.id} className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === loan.id ? null : loan.id)}
                className="w-full text-left"
              >
                <LoanCard loan={loan} />
              </button>
              {expandedId === loan.id ? <LoanDetail loan={loan} /> : null}
            </div>
          ))}
        </div>
      ) : loans.isLoading ? null : (
        <EmptyState
          icon={<IconHandshake />}
          message="Aún no hay préstamos."
          action={<Button onClick={() => setSheetOpen(true)}>Registrar préstamo</Button>}
        />
      )}

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Registrar préstamo">
        <LoanForm onDone={() => setSheetOpen(false)} />
      </Sheet>
    </div>
  );
}
