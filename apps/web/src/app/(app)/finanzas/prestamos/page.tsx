"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { LoanCard, type Loan } from "@/components/finance/LoanCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconHandshake } from "@/components/ui/Icons";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Sheet } from "@/components/ui/Sheet";
import { Tabs } from "@/components/ui/Tabs";
import { clientFetch } from "@/lib/api/client";

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

export default function PrestamosPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [sheetOpen, setSheetOpen] = useState(false);

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
            <LoanCard key={loan.id} loan={loan} />
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
