// services/voice-assistant.service.ts
import { Injectable, signal, computed } from '@angular/core';

export interface VoiceCommand {
  command: string;
  action: string;
  params?: any;
  response: string;
}

export interface VoiceHistory {
  text: string;
  response: string;
  timestamp: Date;
  isUser: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class VoiceAssistantService {
  // État
  private recognition: any = null;
  isListening = signal(false);
  isSupported = signal(false);
  currentTranscript = signal('');
  history = signal<VoiceHistory[]>([]);
  
  // Commande courante
  currentCommand = signal<VoiceCommand | null>(null);
  
  // Callbacks
  private onResultCallback: ((action: string) => void) | null = null;
  
  // Commandes disponibles
  private commands: VoiceCommand[] = [
    { command: 'ventes b2c', action: 'show_commercial', response: 'Je vous montre les ventes B2C' },
    { command: 'b2c', action: 'show_commercial', response: 'Ouverture du module commercial' },
    { command: 'ventes b2b', action: 'show_b2b', response: 'Voici les ventes B2B' },
    { command: 'b2b', action: 'show_b2b', response: 'Ouverture du module B2B' },
    { command: 'achats', action: 'show_purchase', response: 'Affichage du module achats' },
    { command: 'purchase', action: 'show_purchase', response: 'Module achats ouvert' },
    { command: 'marketing', action: 'show_marketing', response: 'Ouverture du tableau de bord marketing' },
    { command: 'finances', action: 'show_financier', response: 'Accès au module financier' },
    { command: 'financier', action: 'show_financier', response: 'Module financier ouvert' },
    { command: 'direction générale', action: 'show_gm', response: 'Tableau de bord direction générale' },
    { command: 'direction', action: 'show_gm', response: 'Direction générale' },
    { command: 'calendrier', action: 'show_calendar', response: 'Voici votre calendrier' },
    { command: 'calendar', action: 'show_calendar', response: 'Calendrier ouvert' },
    { command: 'événements', action: 'show_events', response: 'Liste des événements à venir' },
    { command: 'events', action: 'show_events', response: 'Événements' },
    { command: 'rapport achat', action: 'show_report_achat', response: 'Génération du rapport achats' },
    { command: 'rapport commercial', action: 'show_report_commercial', response: 'Rapport des ventes B2C' },
    { command: 'rapport b2b', action: 'show_report_b2b', response: 'Rapport des ventes B2B' },
    { command: 'rapport marketing', action: 'show_report_marketing', response: 'Rapport marketing' },
    { command: 'rapport financier', action: 'show_report_financier', response: 'Rapport financier' },
    { command: 'rapport direction', action: 'show_report_gm', response: 'Rapport de la direction générale' },
    { command: 'déconnexion', action: 'logout', response: 'Déconnexion...' },
    { command: 'logout', action: 'logout', response: 'Au revoir' },
    { command: 'aide', action: 'help', response: 'Voici les commandes disponibles' },
    { command: 'help', action: 'help', response: 'Commandes disponibles' },
    { command: 'stop', action: 'stop', response: 'Microphone désactivé' },
    { command: 'silence', action: 'stop', response: 'Arrêt du microphone' }
  ];

  constructor() {
    this.initSpeechRecognition();
  }

  private initSpeechRecognition() {
    // Support pour différents navigateurs
    const SpeechRecognition = (window as any).SpeechRecognition || 
                              (window as any).webkitSpeechRecognition ||
                              (window as any).mozSpeechRecognition ||
                              (window as any).msSpeechRecognition;
    
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;  // ← Changé à true pour meilleure capture
      this.recognition.interimResults = true;  // ← Afficher les résultats intermédiaires
      this.recognition.lang = 'fr-FR';
      this.recognition.maxAlternatives = 1;
      
      this.isSupported.set(true);
      this.setupRecognitionEvents();
      
      console.log('✅ Reconnaissance vocale initialisée');
    } else {
      console.warn('❌ Reconnaissance vocale non supportée par ce navigateur');
      this.isSupported.set(false);
    }
  }

  private setupRecognitionEvents() {
    if (!this.recognition) return;

    this.recognition.onstart = () => {
      console.log('🎤 Microphone activé');
      this.isListening.set(true);
      this.currentTranscript.set('');
    };

    this.recognition.onend = () => {
      console.log('🔇 Microphone désactivé');
      this.isListening.set(false);
      
      // Redémarrer automatiquement si on écoute toujours
      if (this.isListening()) {
        setTimeout(() => {
          if (this.isListening()) {
            this.recognition.start();
          }
        }, 100);
      }
    };

    this.recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      // Afficher le transcript intermédiaire
      if (interimTranscript) {
        this.currentTranscript.set(interimTranscript + ' (en cours...)');
      }
      
      // Traiter le transcript final
      if (finalTranscript) {
        const transcript = finalTranscript.toLowerCase().trim();
        console.log('📝 Texte reconnu:', transcript);
        this.currentTranscript.set(transcript);
        
        // Ajouter à l'historique
        const userMessage: VoiceHistory = {
          text: transcript,
          response: '',
          timestamp: new Date(),
          isUser: true
        };
        this.history.update(h => [...h, userMessage]);
        
        // Traiter la commande
        this.processCommand(transcript);
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('❌ Erreur reconnaissance:', event.error);
      this.isListening.set(false);
      
      let errorMessage = '';
      switch(event.error) {
        case 'not-allowed':
          errorMessage = 'Veuillez autoriser l\'accès au microphone';
          break;
        case 'no-speech':
          errorMessage = 'Aucune parole détectée. Essayez à nouveau.';
          break;
        case 'network':
          errorMessage = 'Erreur réseau. Vérifiez votre connexion.';
          break;
        default:
          errorMessage = `Erreur: ${event.error}`;
      }
      
      const errorHistory: VoiceHistory = {
        text: errorMessage,
        response: errorMessage,
        timestamp: new Date(),
        isUser: false
      };
      this.history.update(h => [...h, errorHistory]);
    };
  }

  private processCommand(transcript: string) {
    // Trouver la commande correspondante (recherche flexible)
    let matched: VoiceCommand | null = null;
    
    for (const cmd of this.commands) {
      if (transcript.includes(cmd.command.toLowerCase())) {
        matched = cmd;
        break;
      }
    }
    
    if (matched) {
      this.currentCommand.set(matched);
      
      // Ajouter réponse à l'historique
      const botMessage: VoiceHistory = {
        text: matched.response,
        response: matched.response,
        timestamp: new Date(),
        isUser: false
      };
      this.history.update(h => [...h, botMessage]);
      
      // Jouer la réponse vocale
      this.speak(matched.response);
      
      // Exécuter l'action
      if (this.onResultCallback) {
        this.onResultCallback(matched.action);
      }
    } else {
      const notFound = "Désolé, je n'ai pas compris. Dites 'aide' pour voir les commandes disponibles.";
      const botMessage: VoiceHistory = {
        text: notFound,
        response: notFound,
        timestamp: new Date(),
        isUser: false
      };
      this.history.update(h => [...h, botMessage]);
      this.speak(notFound);
    }
  }

  startListening(): void {
    if (!this.recognition) {
      console.error('Reconnaissance vocale non disponible');
      alert('La reconnaissance vocale n\'est pas supportée par votre navigateur. Utilisez Chrome, Edge ou Safari.');
      return;
    }
    
    try {
      // Demander la permission microphone
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => {
          this.recognition.start();
        })
        .catch((err) => {
          console.error('Permission microphone refusée:', err);
          alert('Veuillez autoriser l\'accès au microphone pour utiliser la commande vocale.');
        });
    } catch (e) {
      console.error('Erreur démarrage:', e);
      alert('Erreur lors du démarrage du microphone');
    }
  }

  stopListening(): void {
    if (this.recognition && this.isListening()) {
      try {
        this.recognition.stop();
      } catch (e) {
        console.error('Erreur arrêt:', e);
      }
    }
    this.isListening.set(false);
  }

  speak(text: string): void {
    if ('speechSynthesis' in window) {
      // Annuler la parole en cours
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'fr-FR';
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      // Attendre un peu que le microphone soit libéré
      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 100);
    }
  }

  cancelSpeech(): void {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  setOnResultCallback(callback: (action: string) => void): void {
    this.onResultCallback = callback;
  }

  getAvailableCommands(): VoiceCommand[] {
    return this.commands;
  }

  clearHistory(): void {
    this.history.set([]);
  }
  
  // Vérifier si le navigateur supporte la reconnaissance vocale
  checkBrowserSupport(): boolean {
    const SpeechRecognition = (window as any).SpeechRecognition || 
                              (window as any).webkitSpeechRecognition;
    return !!SpeechRecognition;
  }
}