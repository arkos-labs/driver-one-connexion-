import { formatIban } from "../lib/driverProfile";

// Champs obligatoires d'un chauffeur : identité, véhicule et coordonnées bancaires.
const INPUT =
  "w-full rounded-xl border border-line bg-paper px-4 py-3 text-[15px] text-ink outline-none placeholder:text-label focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all";

function Field({ label, children }) {
  return (
    <label className="grid gap-1.5">
      <span className="ml-1 text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

export default function DriverInfoFields({ value, onChange }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom">
          <input className={INPUT} placeholder="Jean" autoComplete="given-name" value={value.firstName} onChange={set("firstName")} required />
        </Field>
        <Field label="Nom">
          <input className={INPUT} placeholder="Dupont" autoComplete="family-name" value={value.lastName} onChange={set("lastName")} required />
        </Field>
      </div>
      <Field label="Numéro de téléphone">
        <input className={INPUT} type="tel" inputMode="tel" placeholder="06 12 34 56 78" autoComplete="tel" value={value.phone} onChange={set("phone")} required />
      </Field>
      <Field label="Modèle du véhicule">
        <input className={INPUT} placeholder="Ex : Yamaha XMAX 300" value={value.model} onChange={set("model")} required />
      </Field>
      <Field label="Immatriculation">
        <input
          className={`${INPUT} uppercase`}
          placeholder="AA-123-BB"
          autoCapitalize="characters"
          autoCorrect="off"
          value={value.plate}
          onChange={set("plate")}
          required
        />
      </Field>

      <div className="pt-1">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-label">Coordonnées bancaires (pour vos paiements)</p>
      </div>
      <Field label="IBAN">
        <input
          className={`${INPUT} font-mono uppercase`}
          placeholder="FR76 3000 6000 0112 3456 7890 189"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value={value.iban}
          onChange={(e) => onChange({ ...value, iban: formatIban(e.target.value) })}
          required
        />
      </Field>
      <Field label="BIC">
        <input
          className={`${INPUT} font-mono uppercase`}
          placeholder="BNPAFRPP"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value={value.bic}
          onChange={set("bic")}
          required
        />
      </Field>
    </div>
  );
}
