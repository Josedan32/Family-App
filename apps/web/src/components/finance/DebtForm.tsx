"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { clientFetch } from "@/lib/api/client";
import { pushToast } from "@/lib/toast";

const CURRENCY = "COP";

/** Enough fields (principal, rate, due day, minimum payment, and an entire
 * installment plan) that this lives on its own page rather than a sheet —
 * a modal this tall has nowhere good to put its own scroll. */
export function DebtForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [creditorLabel, setCreditorLabel] = useState("");
  const [creditorTouched, setCreditorTouched] = useState(false);
  const [principal, setPrincipal] = useState(0);
  const [principalTouched, setPrincipalTouched] = useState(false);
  const [interestRate, setInterestRate] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [minimumPayment, setMinimumPayment] = useState(0);
  const [hasPlan, setHasPlan] = useState(false);
  const [installmentsTotal, setInstallmentsTotal] = useState("");
  const [installmentAmount, setInstallmentAmount] = useState(0);
  const [firstInstallmentOn, setFirstInstallmentOn] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const create = useMutation({
    mutationFn: () =>
      clientFetch("/me/debts", {
        method: "POST",
        body: JSON.stringify({
          name,
          creditor_type: "other",
          creditor_label: creditorLabel,
          principal_minor: principal,
          annual_interest_rate: interestRate ? Number(interestRate) : null,
          due_day: dueDay ? Number(dueDay) : null,
          minimum_payment_minor: minimumPayment > 0 ? minimumPayment : null,
          ...(hasPlan
            ? {
                installments_total: Number(installmentsTotal),
                installment_amount_minor: installmentAmount,
                first_installment_on: firstInstallmentOn,
              }
            : {}),
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
      pushToast({ message: "Deuda registrada", type: "success" });
      onDone();
    },
  });

  const planIncomplete =
    hasPlan && (!installmentsTotal || Number(installmentsTotal) <= 0 || installmentAmount <= 0);
  const nameError = nameTouched && !name ? "Dale un nombre a esta deuda" : undefined;
  const creditorError = creditorTouched && !creditorLabel ? "Dinos a quién le debes" : undefined;
  const principalError =
    principalTouched && principal <= 0 ? "Ingresa un monto mayor a cero" : undefined;
  const canSubmit = !!name && !!creditorLabel && principal > 0 && !planIncomplete;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setNameTouched(true);
        setCreditorTouched(true);
        setPrincipalTouched(true);
        if (canSubmit) create.mutate();
      }}
    >
      <Input
        label="Nombre"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => setNameTouched(true)}
        error={nameError}
      />
      <Input
        label="Acreedor"
        required
        value={creditorLabel}
        onChange={(e) => setCreditorLabel(e.target.value)}
        onBlur={() => setCreditorTouched(true)}
        error={creditorError}
      />
      <MoneyInput
        label="Monto"
        value={principal}
        onChange={setPrincipal}
        onBlur={() => setPrincipalTouched(true)}
        currency={CURRENCY}
        kind="debt"
        error={principalError}
        required
      />
      <Input
        label="Tasa de interés anual % (opcional)"
        type="number"
        inputMode="decimal"
        min={0}
        max={999.99}
        step={0.01}
        value={interestRate}
        onChange={(e) => setInterestRate(e.target.value)}
      />
      <Input
        label="Día de corte (opcional)"
        type="number"
        min={1}
        max={31}
        value={dueDay}
        onChange={(e) => setDueDay(e.target.value)}
      />
      <MoneyInput
        label="Pago mínimo mensual (opcional)"
        value={minimumPayment}
        onChange={setMinimumPayment}
        currency={CURRENCY}
        kind="debt"
      />

      <label className="flex items-center gap-2.5 text-sm font-medium">
        <input
          type="checkbox"
          checked={hasPlan}
          onChange={(e) => setHasPlan(e.target.checked)}
          className="h-5 w-5"
        />
        Tiene un plan de cuotas
      </label>

      {hasPlan ? (
        <div className="flex flex-col gap-5 rounded-xl border border-border p-3.5">
          <Input
            label="Número de cuotas"
            type="number"
            min={1}
            max={360}
            required
            value={installmentsTotal}
            onChange={(e) => setInstallmentsTotal(e.target.value)}
          />
          <MoneyInput
            label="Valor de la cuota"
            value={installmentAmount}
            onChange={setInstallmentAmount}
            currency={CURRENCY}
            kind="debt"
            required
          />
          <Input
            label="Primera cuota"
            type="date"
            required
            value={firstInstallmentOn}
            onChange={(e) => setFirstInstallmentOn(e.target.value)}
          />
        </div>
      ) : null}

      {create.isError ? (
        <p role="alert" className="text-sm text-danger">
          {(create.error as Error).message}
        </p>
      ) : null}
      <Button type="submit" disabled={create.isPending || !canSubmit}>
        {create.isPending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
