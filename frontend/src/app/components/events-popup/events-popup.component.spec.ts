import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventsPopupComponent } from './events-popup.component';

describe('EventsPopupComponent', () => {
  let component: EventsPopupComponent;
  let fixture: ComponentFixture<EventsPopupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventsPopupComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventsPopupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
