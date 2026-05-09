// components/video-call/video-call.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VideoCallService } from '../../services/video-call.service';
import { KeycloakRoleService } from '../../services/keycloak-role.service';

@Component({
  selector: 'app-video-call',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Fenêtre d'appel -->
    <div class="video-call-overlay" *ngIf="isOpen">
      <div class="video-call-container">
        <div class="call-header">
          <div class="call-info">
            <span class="call-icon">🎥</span>
            <span class="call-title">Réunion</span>
            <span class="call-room">{{ roomName }}</span>
          </div>
          <div class="call-actions">
            <button (click)="toggleAudio()" class="action-btn" [class.muted]="isMuted" title="Micro">🎤</button>
            <button (click)="toggleVideo()" class="action-btn" [class.video-off]="isVideoOff" title="Caméra">📹</button>
            <button (click)="shareScreen()" class="action-btn" title="Partage d'écran">🖥️</button>
            <button (click)="leaveCall()" class="action-btn leave" title="Quitter">📞 Quitter</button>
          </div>
        </div>
        <div id="jitsi-frame" class="jitsi-frame"></div>
        <div class="call-footer">
          <div class="call-controls">
            <button (click)="inviteTeam()" class="control-btn" [disabled]="isLoading">
              {{ isLoading ? '📧 Envoi...' : '📧 Inviter' }}
            </button>
            <button (click)="copyMeetingLink()" class="control-btn">🔗 Copier lien</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Bouton d'appel flottant -->
    <button class="call-trigger" (click)="openCall()" *ngIf="!isOpen">
      🎥 Réunion Jitsi
    </button>
  `,
  styles: [`
    .video-call-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.85);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .video-call-container {
      width: 90vw;
      height: 85vh;
      max-width: 1200px;
      background: #1e293b;
      border-radius: 20px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .call-header {
      background: #0f172a;
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .call-info {
      display: flex;
      align-items: center;
      gap: 12px;
      color: white;
    }
    .call-room {
      font-size: 11px;
      background: rgba(255,255,255,0.2);
      padding: 4px 8px;
      border-radius: 20px;
    }
    .call-actions {
      display: flex;
      gap: 10px;
    }
    .action-btn {
      background: #334155;
      border: none;
      color: white;
      width: 40px;
      height: 40px;
      border-radius: 20px;
      cursor: pointer;
    }
    .action-btn.leave {
      background: #dc2626;
      width: auto;
      padding: 0 20px;
    }
    .jitsi-frame {
      flex: 1;
      min-height: 0;
    }
    .call-footer {
      background: #0f172a;
      padding: 12px 20px;
      border-top: 1px solid #334155;
    }
    .call-controls {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .control-btn {
      background: #3b82f6;
      border: none;
      color: white;
      padding: 6px 14px;
      border-radius: 20px;
      cursor: pointer;
    }
    .control-btn:disabled {
      background: #64748b;
    }
    .call-trigger {
      position: fixed;
      bottom: 100px;
      right: 20px;
      background: linear-gradient(135deg, #1e3a8a, #3b82f6);
      color: white;
      border: none;
      padding: 14px 24px;
      border-radius: 40px;
      cursor: pointer;
      z-index: 1000;
      font-weight: bold;
    }
  `]
})
export class VideoCallComponent implements OnInit, OnDestroy {
  isOpen = false;
  roomName = '';
  isMuted = false;
  isVideoOff = false;
  isLoading = false;

  constructor(
    private videoCallService: VideoCallService,
    private roleService: KeycloakRoleService
  ) {}

  ngOnInit() {
    this.roomName = this.videoCallService.generateRoomName();
  }

  ngOnDestroy() {
    if (this.videoCallService.isInCallActive()) {
      this.videoCallService.leaveCall();
    }
  }

  openCall() {
    this.isOpen = true;
    setTimeout(() => {
      this.videoCallService.joinCall('jitsi-frame', this.roomName, this.getUserName());
    }, 100);
  }

  leaveCall() {
    this.videoCallService.leaveCall();
    this.isOpen = false;
  }

  toggleAudio() {
    this.isMuted = this.videoCallService.toggleAudio();
  }

  toggleVideo() {
    this.isVideoOff = this.videoCallService.toggleVideo();
  }

  shareScreen() {
    alert('Utilisez le bouton "Partager l\'écran" dans Jitsi');
  }

  async inviteTeam() {
    this.isLoading = true;
    const recipients = this.getTeamEmails();
    
    const result = await this.videoCallService.inviteTeam(
      this.roomName,
      this.getUserName(),
      recipients
    );
    
    if (result.sent > 0) {
      alert(`📧 ${result.sent} invitation(s) envoyée(s) !`);
      await this.copyMeetingLink();
    } else {
      alert('❌ Aucun email envoyé');
    }
    this.isLoading = false;
  }

  private getTeamEmails() {
    const emails = [];
    const roleEmails: Record<string, { email: string; name: string }> = {
      general_manager: { email: 'chahnez.elbez@esprit.tn', name: 'Directeur Général' },
      financier: { email: 'takouahichri67@gmail.com', name: 'Responsable Finance' },
      marketing: { email: 'marketing@sougui.tn', name: 'Marketing' },
      vente_b2b: { email: 'b2b@sougui.tn', name: 'B2B' },
      vente_b2c: { email: 'b2c@sougui.tn', name: 'B2C' },
      achat: { email: 'sabrinezaddem18@gmail.com', name: 'Achats' }
    };
    
    for (const [role, data] of Object.entries(roleEmails)) {
      emails.push({ email: data.email, name: data.name, role });
    }
    return emails;
  }

  async copyMeetingLink() {
    const link = `${window.location.origin}/call/${this.roomName}`;
    await navigator.clipboard.writeText(link);
  }

  private getUserName(): string {
    try {
      const keycloak = (window as any).keycloak;
      if (keycloak?.tokenParsed?.name) {
        return keycloak.tokenParsed.name;
      }
    } catch (e) {}
    return 'Utilisateur Sougui';
  }
}