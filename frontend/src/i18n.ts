import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Lang = "fr" | "en";

export const translations = {
  fr: {
    appName: "Pizza Denfert",
    tagline: "Pizzeria artisanale franco-italienne",
    address: "61 Rue Denfert-Rochereau, 69004 Lyon",
    hoursLunch: "Déjeuner · 10h30 - 15h00",
    hoursDinner: "Dîner · 18h00 - 23h00",
    home: "Accueil",
    menu: "Menu",
    reserve: "Réserver",
    account: "Compte",
    seeMenu: "Voir le menu",
    bookTable: "Réserver une table",
    presentation: "Pizza Denfert allie farine française traditionnelle, produits locaux de la région Rhône-Alpes et savoir-faire italien authentique pour créer des pizzas artisanales uniques, inspirées des traditions culinaires françaises et italiennes.",
    pillars: {
      flour: "Farine française traditionnelle",
      local: "Produits locaux Rhône-Alpes",
      inspiration: "Inspiration italienne et française",
      art: "Préparation artisanale",
      selected: "Ingrédients sélectionnés",
      quality: "Qualité et fraîcheur",
    },
    categories: {
      pizzas: "Pizzas",
      focaccias: "Focaccias",
      gratins: "Gratins",
      salades: "Salades",
      desserts: "Desserts",
      boissons: "Boissons",
      vins: "Vins",
    },
    date: "Date", time: "Heure", guests: "Convives", name: "Nom", phone: "Téléphone", notes: "Notes",
    confirmReservation: "Confirmer la réservation",
    reservationConfirmed: "Réservation confirmée",
    seeYou: "À très vite chez Pizza Denfert.",
    signIn: "Se connecter", signUp: "Créer un compte",
    signInGoogle: "Continuer avec Google",
    email: "Email", password: "Mot de passe",
    loyaltyCard: "Carte de fidélité VIP",
    pointsHint: "3 pizzas = café offert · 5 = dessert offert · 10 = Margherita offerte",
    yourQR: "Présentez ce QR code en restaurant",
    noReservations: "Aucune réservation",
    backHome: "Retour à l'accueil",
    logout: "Déconnexion",
    pleaseLogin: "Veuillez vous connecter",
  },
  en: {
    appName: "Pizza Denfert",
    tagline: "Franco-Italian artisan pizzeria",
    address: "61 Rue Denfert-Rochereau, 69004 Lyon",
    hoursLunch: "Lunch · 10:30 AM - 3:00 PM",
    hoursDinner: "Dinner · 6:00 PM - 11:00 PM",
    home: "Home", menu: "Menu", reserve: "Reserve", account: "Account",
    seeMenu: "View menu",
    bookTable: "Book a table",
    presentation: "Pizza Denfert combines traditional French flour, local Rhône-Alpes ingredients, and authentic Italian know-how to create unique artisanal pizzas inspired by both French and Italian culinary traditions.",
    pillars: {
      flour: "Traditional French flour",
      local: "Rhône-Alpes local produce",
      inspiration: "Italian & French inspiration",
      art: "Artisanal preparation",
      selected: "Selected ingredients",
      quality: "Quality and freshness",
    },
    categories: {
      pizzas: "Pizzas", focaccias: "Focaccias", gratins: "Gratins", salades: "Salads",
      desserts: "Desserts", boissons: "Drinks", vins: "Wines",
    },
    date: "Date", time: "Time", guests: "Guests", name: "Name", phone: "Phone", notes: "Notes",
    confirmReservation: "Confirm reservation",
    reservationConfirmed: "Reservation confirmed",
    seeYou: "See you soon at Pizza Denfert.",
    signIn: "Sign in", signUp: "Create account",
    signInGoogle: "Continue with Google",
    email: "Email", password: "Password",
    loyaltyCard: "VIP Loyalty Card",
    pointsHint: "3 pizzas = free coffee · 5 = free dessert · 10 = free Margherita",
    yourQR: "Show this QR code in restaurant",
    noReservations: "No reservations",
    backHome: "Back to home",
    logout: "Log out",
    pleaseLogin: "Please sign in",
  },
};

let _lang: Lang = "fr";
const listeners = new Set<(l: Lang) => void>();
export function getLang() { return _lang; }
export function setLang(l: Lang) {
  _lang = l;
  AsyncStorage.setItem("@lang", l).catch(() => {});
  listeners.forEach((cb) => cb(l));
}

export function useI18n() {
  const [lang, setL] = useState<Lang>(_lang);
  useEffect(() => {
    AsyncStorage.getItem("@lang").then((v) => {
      if (v === "fr" || v === "en") { _lang = v; setL(v); }
    });
    const cb = (l: Lang) => setL(l);
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  }, []);
  return {
    lang,
    setLang: (l: Lang) => setLang(l),
    t: (k: string) => {
      const dict = translations[lang] as any;
      const parts = k.split(".");
      let cur: any = dict;
      for (const p of parts) cur = cur?.[p];
      return cur ?? k;
    },
  };
}
