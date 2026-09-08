import { useTranslation } from "react-i18next";

type Props = { onHome: () => void };

export function InvalidShare({ onHome }: Props) {
  const { t } = useTranslation();
  return (
    <section className="card">
      <h2>{t("invalidShareTitle")}</h2>
      <p className="lead">{t("invalidShareBody")}</p>
      <button className="primary" type="button" onClick={onHome}>
        {t("home")}
      </button>
    </section>
  );
}
