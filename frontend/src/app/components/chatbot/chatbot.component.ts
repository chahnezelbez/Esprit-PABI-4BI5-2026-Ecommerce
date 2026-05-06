import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KeycloakRoleService } from '../../services/keycloak-role.service';
import { ChatbotService } from '../../services/chatbot.service';
import { ChatMessage, GeminiMessage } from '../../models/chat.model';

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.scss'],
})
export class ChatbotComponent implements OnInit, AfterViewChecked {

  @ViewChild('messagesEnd') messagesEnd!: ElementRef;

  isOpen      = false;
  isLoading   = false;
  userInput   = '';
  messages: ChatMessage[]    = [];
  history: GeminiMessage[]   = [];
  suggestions: string[]      = [];
  showSuggestions            = true;
  errorMsg                   = '';

  // Détecter le rôle actif de l'utilisateur connecté
  get userRole(): string {
    const roles = ['achat', 'vente_b2c', 'vente_b2b', 'marketing', 'financier', 'general_manager'];
    return roles.find(r => this.roleService.hasRole(r)) ?? 'general_manager';
  }

  get roleLabel(): string {
    const labels: Record<string, string> = {
      achat:           'Achats',
      vente_b2c:       'Ventes B2C',
      vente_b2b:       'Ventes B2B',
      marketing:       'Marketing',
      financier:       'Finance',
      general_manager: 'Direction Générale',
    };
    return labels[this.userRole] ?? this.userRole;
  }

  constructor(
    private roleService:    KeycloakRoleService,
    private chatbotService: ChatbotService,
  ) {}

  ngOnInit(): void {
    this.suggestions = this.chatbotService.getSuggestions(this.userRole);
    this.addWelcomeMessage();
  }
// Dans chatbot.component.ts
handleEnterKey(event: Event): void {
  const keyboardEvent = event as KeyboardEvent;
  
  // Si Shift + Entrée : laisser la nouvelle ligne
  if (keyboardEvent.shiftKey) {
    return;
  }
  
  // Sinon : envoyer le message
  keyboardEvent.preventDefault();
  this.sendMessage();
}
  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  // ── Ouvrir / fermer ─────────────────────────────────────────
  toggle(): void {
    this.isOpen = !this.isOpen;
  }

  // ── Message de bienvenue ────────────────────────────────────
  private addWelcomeMessage(): void {
    this.messages.push({
      id:        this.newId(),
      role:      'assistant',
      content:   `Bonjour ! Je suis votre assistant IA dédié au département **${this.roleLabel}**.\n\nPosez-moi vos questions sur vos données — je suis là pour vous aider à analyser et interpréter vos KPIs.`,
      timestamp: new Date(),
    });
  }

  // ── Envoyer un message ──────────────────────────────────────
  sendMessage(text?: string): void {
    const content = (text ?? this.userInput).trim();
    if (!content || this.isLoading) return;

    this.userInput      = '';
    this.showSuggestions = false;
    this.errorMsg       = '';

    // Ajouter le message utilisateur
    this.messages.push({
      id:        this.newId(),
      role:      'user',
      content,
      timestamp: new Date(),
    });

    // Ajouter un message "loading" temporaire
    const loadingId = this.newId();
    this.messages.push({
      id:        loadingId,
      role:      'assistant',
      content:   '',
      timestamp: new Date(),
      loading:   true,
    });

    this.isLoading = true;

    this.chatbotService.sendMessage(this.history, content, this.userRole).subscribe({
      next: (reply) => {
        // Mettre à jour l'historique Gemini
        this.history.push(
          { role: 'user',  parts: [{ text: content }] },
          { role: 'model', parts: [{ text: reply }] }
        );
        // Garder l'historique à 10 échanges max (20 messages)
        if (this.history.length > 20) {
          this.history = this.history.slice(-20);
        }

        // Remplacer le message loading par la réponse réelle
        const idx = this.messages.findIndex(m => m.id === loadingId);
        if (idx !== -1) {
          this.messages[idx] = {
            id:        loadingId,
            role:      'assistant',
            content:   reply,
            timestamp: new Date(),
            loading:   false,
          };
        }
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMsg = err.message;
        this.messages = this.messages.filter(m => m.id !== loadingId);
        this.isLoading = false;
      }
    });
  }

  // ── Réinitialiser la conversation ───────────────────────────
  clearChat(): void {
    this.messages        = [];
    this.history         = [];
    this.showSuggestions = true;
    this.errorMsg        = '';
    this.addWelcomeMessage();
  }

  // ── Scroll vers le bas ──────────────────────────────────────
  private scrollToBottom(): void {
    try {
      this.messagesEnd?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
    } catch {}
  }

  // ── Générer un ID unique ────────────────────────────────────
  private newId(): string {
    return Math.random().toString(36).slice(2);
  }

  // ── Formatter le texte markdown simple ─────────────────────
  formatMessage(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }
}