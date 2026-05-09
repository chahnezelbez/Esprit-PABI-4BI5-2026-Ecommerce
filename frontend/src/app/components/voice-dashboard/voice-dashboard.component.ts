// components/voice-dashboard/voice-dashboard.component.ts
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { VoiceAssistantService, VoiceHistory, VoiceCommand } from '../../services/voice-assistant.service';
import { KeycloakService } from 'keycloak-angular';

@Component({
  selector: 'app-voice-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './voice-dashboard.component.html',
  styleUrls: ['./voice-dashboard.component.scss']
})
export class VoiceDashboardComponent implements OnInit, OnDestroy {
  private voiceService = inject(VoiceAssistantService);
  private router = inject(Router);
  private keycloak = inject(KeycloakService);
  
  isOpen = false;
  isMinimized = false;
  permissionError = false;
  
  // Exposer les signaux
  get isListening() { return this.voiceService.isListening(); }
  get currentTranscript() { return this.voiceService.currentTranscript(); }
  get history() { return this.voiceService.history(); }
  get isSupported() { return this.voiceService.isSupported(); }
  
  constructor() {
    this.voiceService.setOnResultCallback((action: string) => {
      this.handleVoiceAction(action);
    });
  }
  
  ngOnInit() {
    // Vérifier le support
    if (!this.voiceService.checkBrowserSupport()) {
      this.permissionError = true;
    }
    
    // Message de bienvenue
    setTimeout(() => {
      if (this.isSupported && !this.permissionError) {
        this.voiceService.speak('Bienvenue sur le tableau de bord vocal Sougui');
      }
    }, 1000);
  }
  
  ngOnDestroy() {
    this.voiceService.cancelSpeech();
    this.voiceService.stopListening();
  }
  
  toggleDashboard() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.isMinimized = false;
    }
  }
  
  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
  }
  
  async startListening() {
    // Vérifier la permission microphone
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      this.permissionError = false;
      this.voiceService.startListening();
    } catch (err) {
      console.error('Permission microphone refusée');
      this.permissionError = true;
      alert('Veuillez autoriser l\'accès au microphone dans les paramètres de votre navigateur.');
    }
  }
  
  stopListening() {
    this.voiceService.stopListening();
  }
  
  handleVoiceAction(action: string) {
    switch(action) {
      case 'show_commercial':
        this.router.navigate(['/commercial']);
        break;
      case 'show_b2b':
        this.router.navigate(['/b2b']);
        break;
      case 'show_purchase':
        this.router.navigate(['/purchase']);
        break;
      case 'show_marketing':
        this.router.navigate(['/marketing']);
        break;
      case 'show_financier':
        this.router.navigate(['/financier']);
        break;
      case 'show_gm':
        this.router.navigate(['/gm']);
        break;
      case 'show_calendar':
        this.router.navigate(['/calendar']);
        break;
      case 'show_events':
        this.router.navigate(['/events']);
        break;
      case 'show_report_achat':
        this.router.navigate(['/report/achat']);
        break;
      case 'show_report_commercial':
        this.router.navigate(['/report/commercial']);
        break;
      case 'show_report_b2b':
        this.router.navigate(['/report/b2b']);
        break;
      case 'show_report_marketing':
        this.router.navigate(['/report/marketing']);
        break;
      case 'show_report_financier':
        this.router.navigate(['/report/financier']);
        break;
      case 'show_report_gm':
        this.router.navigate(['/report/gm']);
        break;
      case 'logout':
        this.keycloak.logout();
        break;
      case 'stop':
        this.stopListening();
        break;
      case 'help':
        this.showHelp();
        break;
      default:
        break;
    }
    // Fermer le dashboard après action
    this.isOpen = false;
  }
  
  private showHelp() {
    const commands = this.voiceService.getAvailableCommands();
    const uniqueCommands = [...new Map(commands.map(c => [c.command, c])).values()];
    const commandList = uniqueCommands.slice(0, 15).map(c => c.command).join(', ');
    this.voiceService.speak(`Commandes disponibles: ${commandList}`);
  }
  
  clearHistory() {
    this.voiceService.clearHistory();
  }
}