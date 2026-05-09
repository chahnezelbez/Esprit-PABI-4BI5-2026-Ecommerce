# Theme Keycloak Sougui (Login)

Ce projet contient un theme Keycloak personnalise:

- Dossier: `keycloak/themes/sougui-artisan/login`
- Style: `resources/css/sougui-login.css`
- Logo: `resources/img/sougui-logo.svg`

## Activation en local (Keycloak 24)

1. Copier le dossier `sougui-artisan` dans le repertoire themes de Keycloak:
   - Windows: `%KEYCLOAK_HOME%\themes\sougui-artisan`
   - Linux/macOS: `$KEYCLOAK_HOME/themes/sougui-artisan`
2. Demarrer Keycloak:
   - `kc.bat start-dev --http-port=8180` (Windows)
   - `kc.sh start-dev --http-port=8180` (Linux/macOS)
3. Ouvrir l'admin Keycloak, puis:
   - `Realm settings` -> `Themes` -> `Login theme` = `sougui-artisan`
4. Sauvegarder et tester la page de connexion.

## Personnalisation

- Couleurs principales dans `sougui-login.css`:
  - Bleu Sougui: `#1e3a8a`
  - Bleu fonce: `#14295f`
  - Dore accent: `#d4a017`
  - Beige artisanal: `#f5e9da`
- Pour utiliser le logo officiel Sougui, remplacez le fichier:
  - `keycloak/themes/sougui-artisan/login/resources/img/sougui-logo.svg`
