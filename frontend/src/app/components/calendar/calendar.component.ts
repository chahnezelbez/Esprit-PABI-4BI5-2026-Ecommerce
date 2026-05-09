import { Component, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FullCalendarModule } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/daygrid';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FullCalendarModule],

  // 🔥 IMPORTANT: permet d'appliquer le CSS global FullCalendar
  encapsulation: ViewEncapsulation.None,

  template: `
    <div class="sougui-wrapper">

      <div class="header">
        <h2>📅 Calendrier Sougui Tunisie</h2>
        <p>Ramadan • Aid • Jours fériés</p>
      </div>

      <div class="card">
        <full-calendar [options]="calendarOptions"></full-calendar>
      </div>

    </div>
  `,

  styles: [`
    /* 🌈 BACKGROUND */
    .sougui-wrapper {
      padding: 25px;
      min-height: 100vh;
      background: linear-gradient(135deg, #F5E9DA, #FAF9F6);
    }

    /* HEADER */
    .header h2 {
      color: #1E3A8A;
      font-size: 26px;
      font-weight: 900;
      margin: 0;
    }

    .header p {
      color: #6b7280;
      font-size: 13px;
      margin-bottom: 15px;
    }

    /* CARD WOW */
    .card {
      background: rgba(255,255,255,0.9);
      backdrop-filter: blur(10px);
      border-radius: 18px;
      padding: 16px;
      box-shadow: 0 20px 50px rgba(30,58,138,0.2);
    }

    /* FULLCALENDAR */
    .fc {
      font-family: Arial;
    }

    .fc .fc-toolbar-title {
      color: #1E3A8A;
      font-weight: 800;
    }

    .fc .fc-button {
      background: #1E3A8A !important;
      border: none !important;
      border-radius: 8px !important;
    }

    .fc .fc-button:hover {
      background: #D4A017 !important;
      color: black !important;
    }

    /* EVENTS GLOBAL */
    .fc-event {
      border: none !important;
      border-radius: 10px !important;
      font-weight: 600;
      transition: 0.3s;
    }

    .fc-event:hover {
      transform: scale(1.05);
      box-shadow: 0 0 20px rgba(30,58,138,0.5);
    }
  `]
})
export class CalendarComponent {

  calendarOptions = {
    plugins: [dayGridPlugin],
    initialView: 'dayGridMonth',

    // 🔥 IMPORTANT: couleurs directes (PAS classNames)
    events: [
      {
        title: '🌙 Ramadan',
        date: '2026-02-17',
        backgroundColor: '#1E3A8A',
        textColor: '#ffffff'
      },
      {
        title: '🕌 Iftar',
        date: '2026-02-20',
        backgroundColor: '#2563eb',
        textColor: '#ffffff'
      },
      {
        title: '✨ Nuit du destin',
        date: '2026-03-08',
        backgroundColor: '#3b82f6',
        textColor: '#ffffff'
      },
      {
        title: '🎉 Aid El Fitr',
        date: '2026-03-19',
        backgroundColor: '#D4A017',
        textColor: '#1f2937'
      },
      {
        title: '🇹🇳 Indépendance',
        date: '2026-03-20',
        backgroundColor: '#ef4444',
        textColor: '#ffffff'
      }
    ],

    // ✨ BONUS WOW EFFECT
    eventDidMount: (info: any) => {
      info.el.style.borderRadius = "10px";
      info.el.style.boxShadow = "0 0 12px rgba(30,58,138,0.3)";
      info.el.style.padding = "3px";
    }
  };
}