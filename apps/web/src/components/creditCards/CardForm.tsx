"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { clientFetch } from "@/lib/api/client";
import { addDays, formatDayMonth, nextCutoffOn, todayLocal } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { pushToast } from "@/lib/toast";

import { isDay, isPercent, parsePercent } from "./decimal";

const CURRENCY = "COP";

export function CardForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [bank, setBank] = useState("");
  const [bankTouched, setBankTouched] = useState(false);
  const [limit, setLimit] = useState(0);
  const [limitTouched, setLimitTouched] = useState(false);
  const [cutoff, setCutoff] = useState("");
  const [days, setDays] = useState("15");
  const [rate, setRate] = useState("");
  const [minPct, setMinPct] = useState("");
  const [floor, setFloor] = useState(0);

  const create = useMutation({
    mutationFn: () =>
      clientFetch("/me/credit-cards", {
        method: "POST",
        body: JSON.stringify({
          nickname: name,
          bank_label: bank,
          credit_limit_minor: limit,
          interest_rate_monthly_pct: parsePercent(rate),
          minimum_payment_pct: parsePercent(minPct),
          minimum_payment_floor_minor: floor > 0 ? floor : null,
          statement_cutoff_day: Number(cutoff),
          payment_due_days: Number(days),
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["credit-cards"] });
      pushToast({ message: "Tarjeta registrada", type: "success" });
      onDone();
    },
  });

  const cutoffValid = isDay(cutoff, 28);
  const daysValid = isDay(days, 90);
  const canSubmit =
    !!name &&
    !!bank &&
    limit > 0 &&
    cutoffValid &&
    daysValid &&
    isPercent(rate) &&
    isPercent(minPct) &&
    parsePercent(minPct) > 0;
  const nameError = nameTouched && !name ? "Dale un nombre a esta tarjeta" : undefined;
  const bankError = bankTouched && !bank ? "Dinos de qué banco es" : undefined;
  const limitError = limitTouched && limit <= 0 ? "Ingresa un cupo mayor a cero" : undefined;
  const cutoffError =
    cutoff !== "" && !cutoffValid ? "Elige un día entre 1 y 28" : undefined;
  const daysError = days !== "" && !daysValid ? "Elige entre 1 y 90 días" : undefined;

  const rateError =
    rate !== "" && !isPercent(rate) ? "Ingresa un porcentaje entre 0 y 999,99" : undefined;
  const minPctError =
    minPct !== "" && !isPercent(minPct) ? "Ingresa un porcentaje entre 0 y 999,99" : undefined;

  const next = cutoffValid ? nextCutoffOn(Number(cutoff), todayLocal()) : "";

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setNameTouched(true);
        setBankTouched(true);
        setLimitTouched(true);
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
        label="Banco"
        required
        value={bank}
        onChange={(e) => setBank(e.target.value)}
        onBlur={() => setBankTouched(true)}
        error={bankError}
      />
      <MoneyInput
        label="Cupo"
        value={limit}
        onChange={setLimit}
        onBlur={() => setLimitTouched(true)}
        currency={CURRENCY}
        error={limitError}
        required
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Día de corte"
          type="number"
          inputMode="numeric"
          min={1}
          max={28}
          required
          value={cutoff}
          onChange={(e) => setCutoff(e.target.value)}
          error={cutoffError}
        />
        <Input
          label="Días para pagar"
          type="number"
          inputMode="numeric"
          min={1}
          max={90}
          required
          value={days}
          onChange={(e) => setDays(e.target.value)}
          error={daysError}
        />
        {cutoffValid && daysValid ? (
          <span className="col-span-2 text-xs text-text-muted">
            Corte el {cutoff} de cada mes; la fecha límite de pago cae {days} días después (el
            próximo extracto: {formatDayMonth(next)} → {formatDayMonth(addDays(next, Number(days)))}).
          </span>
        ) : null}
      </div>

      <Input
        label="Interés mensual"
        type="text"
        inputMode="decimal"
        required
        helperText="Porcentaje mensual, por ejemplo 1,89"
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        error={rateError}
      />

      <div className="flex flex-col gap-3 rounded-xl border border-border p-3.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Pago mínimo
        </span>
        <Input
          label="Porcentaje"
          type="text"
          inputMode="decimal"
          required
          value={minPct}
          onChange={(e) => setMinPct(e.target.value)}
          error={minPctError}
        />
        <MoneyInput label="Mínimo desde" value={floor} onChange={setFloor} currency={CURRENCY} />
        {floor > 0 && minPct !== "" ? (
          <span className="text-xs text-text-muted">
            {minPct} % del saldo del extracto, y nunca menos de {formatMoney(floor, CURRENCY)}.
          </span>
        ) : null}
      </div>

      {create.isError ? (
        <p role="alert" className="text-sm text-danger">
          {(create.error as Error).message}
        </p>
      ) : null}
      <Button type="submit" disabled={!canSubmit || create.isPending}>
        {create.isPending ? "Guardando…" : "Registrar tarjeta"}
      </Button>
    </form>
  );
}
