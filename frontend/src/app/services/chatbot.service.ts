// services/chatbot.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';

// ⚠️ Gardez le même type que votre composant utilise
export interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

@Injectable({ providedIn: 'root' })
export class ChatbotService {

  // Groq API
  private readonly API_URL = 'https://api.groq.com/openai/v1/chat/completions';
  private readonly API_KEY = "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";
  private readonly MODEL = 'llama-3.3-70b-versatile';

  constructor(private http: HttpClient) {}

  // ✅ Gardez la signature exacte que votre composant utilise
  sendMessage(
    history: GeminiMessage[],  // ← Gardez GeminiMessage[]
    userMessage: string,
    userRole: string
  ): Observable<string> {

    const systemPrompt = this.buildSystemPrompt(userRole);
    
    // Convertir l'historique Gemini (role: 'user'/'model') au format Groq
    const convertedHistory = this.convertGeminiHistoryToGroq(history);

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...convertedHistory,
      { role: 'user', content: userMessage }
    ];

    const body = {
      model: this.MODEL,
      messages: messages,
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 0.95
    };

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.API_KEY}`,
      'Content-Type': 'application/json'
    });

    return this.http.post<any>(this.API_URL, body, { headers }).pipe(
      map(response => {
        const content = response?.choices?.[0]?.message?.content;
        if (!content) throw new Error('Réponse vide');
        return content;
      }),
      catchError(error => {
        console.error('[Groq Error]', error);
        if (error.status === 401 || error.status === 403) {
          return throwError(() => new Error('❌ Clé API invalide. Vérifiez environment.ts'));
        }
        if (error.status === 429) {
          return throwError(() => new Error('⏰ Limite de requêtes (30/min). Patientez.'));
        }
        return throwError(() => new Error('📡 Erreur de connexion à Groq'));
      })
    );
  }

  // ── Convertir l'historique Gemini → format Groq ─────────────
  private convertGeminiHistoryToGroq(history: GeminiMessage[]): any[] {
    const result: any[] = [];
    
    for (const msg of history) {
      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.parts[0]?.text || '' });
      } else if (msg.role === 'model') {
        result.push({ role: 'assistant', content: msg.parts[0]?.text || '' });
      }
    }
    
    return result;
  }

  // ── Prompt système selon le rôle ───────────────────────────
  private buildSystemPrompt(userRole: string): string {
    const roleLabels: Record<string, string> = {
      achat: 'Achats',
      vente_b2c: 'Ventes B2C',
      vente_b2b: 'Ventes B2B',
      marketing: 'Marketing',
      financier: 'Finance',
      general_manager: 'Direction Générale'
    };
    
    const label = roleLabels[userRole] || userRole;
    
    return `Tu es un assistant IA professionnel pour Sougui.tn.
Tu aides le département "${label}" à analyser ses KPIs.

RÈGLES :
- Réponds UNIQUEMENT en français
- Sois concis (max 5 lignes)
- Utilise des émojis (📊 📈 ⚠️ ✅)
- Propose des actions concrètes

Maintenant, réponds à la question.`;
  }

  // ── Suggestions de questions ────────────────────────────────
  getSuggestions(role: string): string[] {
    const suggestions: Record<string, string[]> = {
      achat: [
        '💰 Quel est le stock critique actuel ?',
        '📦 Quels fournisseurs ont des retards ?',
        '📊 Analyse les coûts d\'achat'
      ],
      vente_b2c: [
        '📈 Quel est le taux de conversion ?',
        '🛒 Quels produits se vendent le mieux ?',
        '🎯 Compare les ventes vs objectifs'
      ],
      vente_b2b: [
        '🤝 Combien de commandes B2B ?',
        '🏢 Quels clients génèrent le plus de CA ?',
        '📊 Où en sont les objectifs B2B ?'
      ],
      marketing: [
        '📢 Quel est le taux d\'engagement ?',
        '🎯 Combien de leads générés ?',
        '📱 Quel canal performe le mieux ?'
      ],
      financier: [
        '💰 Quelle est la marge nette ?',
        '📊 Le CA est-il dans les objectifs ?',
        '📉 Analyse les écarts budgétaires'
      ],
      general_manager: [
        '🏢 Résume la performance globale',
        '⚠️ Quels départements sont en retard ?',
        '🎯 Quels sont les risques principaux ?'
      ]
    };
    
    return suggestions[role] ?? ['📊 Comment se portent les KPIs ?'];
  }
}