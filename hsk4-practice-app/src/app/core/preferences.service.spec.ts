import { TestBed } from '@angular/core/testing';
import { PreferencesService } from './preferences.service';

/** The timer preference is hidden by default and remembered on the device. */
describe('PreferencesService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('hides the response timer by default', () => {
    expect(TestBed.inject(PreferencesService).showResponseTimer()).toBeFalse();
  });

  it('toggles the response timer and persists the choice', () => {
    const prefs = TestBed.inject(PreferencesService);
    prefs.toggleResponseTimer();
    expect(prefs.showResponseTimer()).toBeTrue();

    // A fresh injector reads the stored value rather than the default.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(PreferencesService).showResponseTimer()).toBeTrue();
  });

  it('sets the response timer explicitly', () => {
    const prefs = TestBed.inject(PreferencesService);

    prefs.setResponseTimer(true);
    expect(prefs.showResponseTimer()).toBeTrue();

    prefs.setResponseTimer(false);
    expect(prefs.showResponseTimer()).toBeFalse();
  });
});
