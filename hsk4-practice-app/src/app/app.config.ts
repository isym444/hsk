import {
  APP_INITIALIZER,
  ApplicationConfig,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { AuthService } from './core/auth.service';
import { authInterceptor } from './core/auth.interceptor';
import { RuntimeConfigService } from './core/runtime-config.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),

    /*
     * Both startup steps live in one initializer so their order is guaranteed:
     * config.json has to be read before the Supabase client can be created from
     * it, and the session has to be restored before the router runs — otherwise
     * a signed-in user reloading /stats/reading would be bounced to /login for
     * a frame.
     */
    {
      provide: APP_INITIALIZER,
      useFactory: (config: RuntimeConfigService, auth: AuthService) => async () => {
        await config.load();
        await auth.load();
      },
      deps: [RuntimeConfigService, AuthService],
      multi: true,
    },

    // The interceptor attaches the Supabase access token to every API call
    // (see auth.interceptor.ts); the API base itself comes from config.json.
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
