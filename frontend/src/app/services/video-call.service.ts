// services/video-call.service.ts
import { Injectable } from '@angular/core';
import emailjs from '@emailjs/browser';
import { environment } from '../../environments/environment';

declare const JitsiMeetExternalAPI: any;

@Injectable({
  providedIn: 'root'
})
export class VideoCallService {
  private jitsiApi: any = null;
  private isInCall = false;

  constructor() {}

  generateRoomName(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `sougui-meeting-${timestamp}-${random}`;
  }

  joinCall(frameId: string, roomName: string, userName: string): void {
    const domain = 'meet.jit.si';
    const options = {
      roomName: roomName,
      width: '100%',
      height: '100%',
      parentNode: document.getElementById(frameId),
      userInfo: { displayName: userName },
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        prejoinPageEnabled: false,
        enableWelcomePage: false
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false
      }
    };

    this.jitsiApi = new JitsiMeetExternalAPI(domain, options);
    this.isInCall = true;
  }

  leaveCall(): void {
    if (this.jitsiApi) {
      this.jitsiApi.dispose();
      this.jitsiApi = null;
    }
    this.isInCall = false;
  }

  toggleAudio(): boolean {
    if (this.jitsiApi) {
      this.jitsiApi.executeCommand('toggleAudio');
      return true;
    }
    return false;
  }

  toggleVideo(): boolean {
    if (this.jitsiApi) {
      this.jitsiApi.executeCommand('toggleVideo');
      return true;
    }
    return false;
  }

  isInCallActive(): boolean {
    return this.isInCall;
  }

  async inviteTeam(roomName: string, userName: string, recipients: any[]): Promise<{ sent: number; errors: number }> {
    const link = `${window.location.origin}/call/${roomName}`;
    let sentCount = 0;
    let errorCount = 0;
    
    emailjs.init(environment.emailjs.userId);
    
    for (const recipient of recipients) {
      try {
        const templateParams = {
          to_email: recipient.email,
          to_name: recipient.name,
          from_name: userName,
          inviter_name: userName,
          meeting_date: new Date().toLocaleString('fr-FR'),
          room_name: roomName,
          room_link: link,
          message: `📞 Réunion d'équipe - Analyse des KPIs\n\n${userName} vous invite à rejoindre une réunion vidéo.\n\n🔗 Lien : ${link}`,
          title: `Réunion Sougui - ${roomName}`,
          name: userName,
          email: recipient.email
        };
        
        const result = await emailjs.send(
          environment.emailjs.serviceId,
          environment.emailjs.templateId,
          templateParams
        );
        
        if (result.status === 200) {
          sentCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        errorCount++;
        console.error('Erreur EmailJS:', error);
      }
    }
    
    return { sent: sentCount, errors: errorCount };
  }
}