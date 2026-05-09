// components/events-popup/events-popup.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Event {
  id: string;
  name: string;
  description: string;
  date: string;
  duration: string;
  lieu: string;
  category: string;
  relevance: 'haute' | 'moyenne' | 'basse';
  url: string;
}

@Component({
  selector: 'app-events-popup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './events-popup.component.html',
  styleUrls: ['./events-popup.component.scss']
})
export class EventsPopupComponent implements OnInit {
  
  events: Event[] = [
    {
      id: '1',
      name: 'SIBOS 2026',
      description: 'Le plus grand événement bancaire et financier mondial. Opportunité pour les paiements et solutions e-commerce.',
      date: '15 Mars 2026',
      duration: '4 jours',
      lieu: 'Genève, Suisse',
      category: 'Finance',
      relevance: 'haute',
      url: 'https://www.sibos.com'
    },
    {
      id: '2',
      name: 'GITEX Africa 2026',
      description: 'Le plus grand salon tech en Afrique. Idéal pour le networking et les partenariats digitaux.',
      date: '22 Avril 2026',
      duration: '3 jours',
      lieu: 'Marrakech, Maroc',
      category: 'Tech',
      relevance: 'haute',
      url: 'https://www.gitexafrica.com'
    },
    {
      id: '3',
      name: 'Carthage Trade Show',
      description: 'Salon international du commerce et de l\'industrie en Tunisie.',
      date: '05 Mai 2026',
      duration: '3 jours',
      lieu: 'Tunis, Tunisie',
      category: 'Commerce',
      relevance: 'moyenne',
      url: '#'
    },
    {
      id: '4',
      name: 'Africa E-commerce Summit',
      description: 'Sommet dédié au e-commerce en Afrique. Réseautage avec les acteurs clés.',
      date: '10 Juin 2026',
      duration: '2 jours',
      lieu: 'Casablanca, Maroc',
      category: 'Digital',
      relevance: 'haute',
      url: '#'
    },
    {
      id: '5',
      name: 'Logistics & Supply Chain Expo',
      description: 'Salon spécialisé dans la logistique et la chaîne d\'approvisionnement.',
      date: '18 Septembre 2026',
      duration: '3 jours',
      lieu: 'Tunis, Tunisie',
      category: 'Logistique',
      relevance: 'moyenne',
      url: '#'
    },
    {
      id: '6',
      name: 'Innovation & E-commerce Days',
      description: 'Conférence sur les innovations dans le e-commerce et les nouvelles technologies.',
      date: '02 Octobre 2026',
      duration: '2 jours',
      lieu: 'Paris, France',
      category: 'Digital',
      relevance: 'haute',
      url: '#'
    },
    {
      id: '7',
      name: 'Middle East E-commerce Summit',
      description: 'Salon du e-commerce pour le Moyen-Orient. Opportunités d\'expansion.',
      date: '15 Novembre 2026',
      duration: '3 jours',
      lieu: 'Dubaï, UAE',
      category: 'Vente',
      relevance: 'moyenne',
      url: '#'
    },
    {
      id: '8',
      name: 'Web Summit 2026',
      description: 'Le plus grand événement tech au monde. Networking avec les leaders du digital.',
      date: '03 Décembre 2026',
      duration: '4 jours',
      lieu: 'Lisbonne, Portugal',
      category: 'Tech',
      relevance: 'haute',
      url: '#'
    }
  ];

  filteredEvents: Event[] = [];
  selectedFilter = 'all';
  categories: string[] = [];

  filters = [
    { key: 'all', label: 'Tous', icon: '🌍' },
    { key: 'Finance', label: 'Finance', icon: '💰' },
    { key: 'Tech', label: 'Tech', icon: '💻' },
    { key: 'Digital', label: 'Digital', icon: '📱' },
    { key: 'Logistique', label: 'Logistique', icon: '🚚' },
    { key: 'Vente', label: 'Vente', icon: '📈' },
    { key: 'Commerce', label: 'Commerce', icon: '🛒' }
  ];

  ngOnInit(): void {
    this.applyFilter();
  }

  applyFilter(): void {
    if (this.selectedFilter === 'all') {
      this.filteredEvents = [...this.events];
    } else {
      this.filteredEvents = this.events.filter(e => e.category === this.selectedFilter);
    }
  }

  setFilter(filterKey: string): void {
    this.selectedFilter = filterKey;
    this.applyFilter();
  }

  // 📅 Méthodes pour la date
  getEventDay(dateString: string): string {
    if (!dateString) return '--';
    const parts = dateString.split(' ');
    return parts[0] || '--';
  }

  getEventMonth(dateString: string): string {
    if (!dateString) return '---';
    const parts = dateString.split(' ');
    if (parts.length >= 2) {
      const month = parts[1];
      return month.substring(0, 3).toUpperCase();
    }
    return '---';
  }

  // 🎨 Couleur par catégorie
  getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
      'Finance': '#8b5cf6',
      'Tech': '#3b82f6',
      'Digital': '#10b981',
      'Logistique': '#f59e0b',
      'Vente': '#ef4444',
      'Commerce': '#06b6d4'
    };
    return colors[category] || '#6b7280';
  }

  // 🔢 Compter par catégorie
  getFilterCount(categoryKey: string): number {
    if (categoryKey === 'all') return 0;
    return this.events.filter(e => e.category === categoryKey).length;
  }

  // 📍 Ouvrir URL
  openUrl(url: string): void {
    if (url && url !== '#') {
      window.open(url, '_blank');
    }
  }

  // Getters pour les stats
  get highCountValue(): number {
    return this.filteredEvents.filter(e => e.relevance === 'haute').length;
  }
}