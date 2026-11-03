import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';

@Component({
  selector: 'app-home',
  templateUrl: 'landing.page.html',
  styleUrls: ['landing.page.scss'],
  imports: [IonContent],
})
export class LandingPage implements OnInit, OnDestroy {
  private redirectTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly router: Router) {}

  ngOnInit(): void {
    this.redirectTimer = setTimeout(() => {
      void this.router.navigateByUrl('/login', { replaceUrl: true });
    }, 1800);
  }

  ngOnDestroy(): void {
    if (this.redirectTimer) clearTimeout(this.redirectTimer);
  }
}
