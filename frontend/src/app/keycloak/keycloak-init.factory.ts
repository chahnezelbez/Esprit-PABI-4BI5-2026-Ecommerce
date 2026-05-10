import { KeycloakService } from 'keycloak-angular';

export function initializeKeycloak(keycloak: KeycloakService) {
  return () =>
    keycloak.init({
   config: {
  url: 'https://keycloak-production-1687.up.railway.app',
  realm: 'sougui-realm',
  clientId: 'angular-app'
},
      initOptions: {
        onLoad: 'login-required',       // Force la connexion avant d'afficher l'application
        checkLoginIframe: false         // Évite les erreurs CORS
      },
      enableBearerInterceptor: true,    // Ajoute automatiquement le token JWT aux requêtes HTTP
      bearerPrefix: 'Bearer'
    });
}