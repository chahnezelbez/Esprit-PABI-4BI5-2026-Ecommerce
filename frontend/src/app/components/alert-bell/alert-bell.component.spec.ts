import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AlertBellComponent } from './alert-bell.component';

describe('AlertBellComponent', () => {
  let component: AlertBellComponent;
  let fixture: ComponentFixture<AlertBellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlertBellComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AlertBellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
