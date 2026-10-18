// Logo One Connexion : texte noir en mode clair, texte clair en mode sombre.
export default function ThemedLogo({ alt = "", className = "" }) {
  return (
    <>
      <img src="/logo.svg" alt={alt} className={`theme-logo-light ${className}`} />
      <img src="/logo-dark.svg" alt={alt} className={`theme-logo-dark ${className}`} />
    </>
  );
}
