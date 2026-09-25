import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AuthService } from './core/auth.service';

/**
 * Shell-less root: the routed page components own their own wrappers.
 *
 * The one thing it does own is the account chip, because signing out has to be
 * reachable from every practice and stats page without repeating it in each.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly auth = inject(AuthService);

  signOut(): void {
    void this.auth.signOut();
  }
}
