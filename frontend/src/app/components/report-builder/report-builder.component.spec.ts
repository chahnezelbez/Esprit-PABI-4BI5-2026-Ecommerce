import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportBuilderComponent } from './report-builder.component';

describe('ReportBuilderComponent', () => {
  let component: ReportBuilderComponent;
  let fixture: ComponentFixture<ReportBuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportBuilderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReportBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
