import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VoiceDashboardComponent } from './voice-dashboard.component';

describe('VoiceDashboardComponent', () => {
  let component: VoiceDashboardComponent;
  let fixture: ComponentFixture<VoiceDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VoiceDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VoiceDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
