import { useTranslation } from "react-i18next";

export function InvalidShare() {
  const { t } = useTranslation();
  return (
    <section className="card">
      <h2>{t("invalidShareTitle")}</h2>
      <p className="lead">{t("invalidShareBody")}</p>
    </section>
  );
}
