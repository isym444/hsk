import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Shell-less root: the routed page components own their own wrappers. */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {}
