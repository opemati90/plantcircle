import { catalogs, type Language } from '@plantcircle/copy';

/**
 * The store kit in every language the app speaks: the device locale the capture runs under, the
 * sample content members would have written in that language, and the headlines on each image.
 * Translations need a native speaker's review before publishing, like the app's own copy.
 */
export const STORE_LANGUAGES: Language[] = ['en', 'de', 'es', 'fr', 'it', 'nl', 'pl', 'pt'];

export const DEVICE_LOCALE: Record<Language, string> = {
  en: 'en-GB',
  de: 'de-DE',
  es: 'es-ES',
  fr: 'fr-FR',
  it: 'it-IT',
  nl: 'nl-NL',
  pl: 'pl-PL',
  pt: 'pt-PT',
};

type Tree = { [key: string]: string | Tree };

/** The app's own string at a copy key (`cooks.shareWith`), with `{{name}}` filled in. */
export function copyOf(
  language: Language,
  key: string,
  vars: Record<string, string> = {},
): string {
  const value = key
    .split('.')
    .reduce<string | Tree | undefined>(
      (node, part) => (typeof node === 'object' ? node[part] : undefined),
      catalogs[language] as unknown as Tree,
    );
  if (typeof value !== 'string') throw new Error(`No ${language} copy at ${key}`);
  return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => vars[name] ?? '');
}

/** What members wrote, as they would have written it in each language. */
export interface SampleContent {
  planTitle: string;
  circleTagline: string;
  miaCaption: string;
  olaCaption: string;
  myCaption: string;
  /** Where the Plan is, before the address unlocks. */
  areaHint: string;
}

export const SAMPLE: Record<Language, SampleContent> = {
  en: {
    planTitle: 'Fresh Pasta Night',
    circleTagline: 'Cooking nights and potlucks',
    miaCaption: 'Mushroom pasta with lemon and parsley. Everyone asked for seconds.',
    olaCaption: 'Sunday batch: lentil and vegetable soup for the week',
    myCaption: 'Leftover veg became a sheet-pan roast with tahini. Gone in ten minutes.',
    areaHint: 'Near U7 Rathaus Neukölln',
  },
  de: {
    planTitle: 'Frische-Pasta-Abend',
    circleTagline: 'Kochabende und Potlucks',
    miaCaption: 'Pilzpasta mit Zitrone und Petersilie. Alle wollten Nachschlag.',
    olaCaption: 'Sonntags vorgekocht: Linsen-Gemüse-Suppe für die Woche',
    myCaption: 'Gemüsereste wurden zu Ofengemüse mit Tahin. In zehn Minuten weg.',
    areaHint: 'Nähe U7 Rathaus Neukölln',
  },
  es: {
    planTitle: 'Noche de pasta fresca',
    circleTagline: 'Noches de cocina y comidas compartidas',
    miaCaption: 'Pasta con setas, limón y perejil. Todos repitieron.',
    olaCaption: 'Para toda la semana: sopa de lentejas y verduras',
    myCaption: 'Las verduras sobrantes, asadas al horno con tahini. Volaron en diez minutos.',
    areaHint: 'Cerca del U7 Rathaus Neukölln',
  },
  fr: {
    planTitle: 'Soirée pâtes fraîches',
    circleTagline: 'Soirées cuisine et repas partagés',
    miaCaption: 'Pâtes aux champignons, citron et persil. Tout le monde en a repris.',
    olaCaption: 'Préparée dimanche : soupe de lentilles et légumes pour la semaine',
    myCaption: 'Les restes de légumes, rôtis au four avec du tahini. Partis en dix minutes.',
    areaHint: 'Près du U7 Rathaus Neukölln',
  },
  it: {
    planTitle: 'Serata di pasta fresca',
    circleTagline: 'Serate in cucina e cene condivise',
    miaCaption: 'Pasta ai funghi con limone e prezzemolo. Tutti hanno fatto il bis.',
    olaCaption: 'Preparata domenica: zuppa di lenticchie e verdure per la settimana',
    myCaption: 'Verdure avanzate al forno con tahina. Finite in dieci minuti.',
    areaHint: 'Vicino alla U7 Rathaus Neukölln',
  },
  nl: {
    planTitle: 'Verse-pasta-avond',
    circleTagline: 'Kookavonden en potlucks',
    miaCaption: 'Pasta met paddenstoelen, citroen en peterselie. Iedereen nam nog een bord.',
    olaCaption: 'Zondag voorgekookt: linzen-groentesoep voor de hele week',
    myCaption: 'Restjes groente uit de oven met tahin. In tien minuten op.',
    areaHint: 'Bij U7 Rathaus Neukölln',
  },
  pl: {
    planTitle: 'Wieczór świeżego makaronu',
    circleTagline: 'Wspólne gotowanie i potlucki',
    miaCaption: 'Makaron z grzybami, cytryną i pietruszką. Wszyscy prosili o dokładkę.',
    olaCaption: 'Niedzielne gotowanie: zupa z soczewicy i warzyw na cały tydzień',
    myCaption: 'Resztki warzyw upieczone z tahini. Zniknęły w dziesięć minut.',
    areaHint: 'Blisko U7 Rathaus Neukölln',
  },
  pt: {
    planTitle: 'Noite de massa fresca',
    circleTagline: 'Noites de cozinha e jantares partilhados',
    miaCaption: 'Massa com cogumelos, limão e salsa. Todos repetiram.',
    olaCaption: 'Feita no domingo: sopa de lentilhas e legumes para a semana',
    myCaption: 'Sobras de legumes assadas no forno com tahini. Acabaram em dez minutos.',
    areaHint: 'Perto do U7 Rathaus Neukölln',
  },
};

/** Headline (two lines) and the line under it, for screenshots 1 to 6 in order. */
export type Headlines = { title: [string, string]; sub: string }[];

export const HEADLINES: Record<Language, Headlines> = {
  en: [
    {
      title: ['Find your people.', 'Cook together.'],
      sub: 'A weekly cook club with people near you.',
    },
    {
      title: ['One theme a week.', 'Everyone cooks.'],
      sub: 'Your Circle sets it. You cook it at home.',
    },
    {
      title: ['Show what', 'you cooked.'],
      sub: 'A photo and a line, shared only with your Circle.',
    },
    {
      title: ['Fresh ideas', 'from your Circle.'],
      sub: 'See what others made, say yum, ask how.',
    },
    {
      title: ['Then cook together', 'in person.'],
      sub: 'Cooking nights and potlucks. Join in one tap.',
    },
    {
      title: ['Bring a friend', 'with one link.'],
      sub: 'They can look around first. No app needed.',
    },
  ],
  de: [
    {
      title: ['Finde deine Leute.', 'Kocht zusammen.'],
      sub: 'Ein wöchentlicher Kochclub mit Menschen in deiner Nähe.',
    },
    {
      title: ['Ein Thema pro Woche.', 'Alle kochen mit.'],
      sub: 'Dein Circle legt es fest. Du kochst zu Hause.',
    },
    {
      title: ['Zeig, was', 'du gekocht hast.'],
      sub: 'Ein Foto und ein Satz, nur für deinen Circle.',
    },
    {
      title: ['Neue Ideen', 'aus deinem Circle.'],
      sub: 'Sieh, was andere gekocht haben, und frag nach.',
    },
    {
      title: ['Dann kocht zusammen,', 'vor Ort.'],
      sub: 'Kochabende und Potlucks. Mit einem Tipp dabei.',
    },
    {
      title: ['Bring Freund:innen mit,', 'mit einem Link.'],
      sub: 'Sie können sich erst umsehen. Ganz ohne App.',
    },
  ],
  es: [
    {
      title: ['Encuentra a tu gente.', 'Cocinad juntos.'],
      sub: 'Un club de cocina semanal con gente cerca de ti.',
    },
    {
      title: ['Un tema por semana.', 'Todos cocinan.'],
      sub: 'Tu Circle lo elige. Tú lo cocinas en casa.',
    },
    {
      title: ['Enseña lo que', 'has cocinado.'],
      sub: 'Una foto y una frase, solo para tu Circle.',
    },
    {
      title: ['Ideas nuevas', 'de tu Circle.'],
      sub: 'Mira lo que han cocinado otros y pregunta cómo.',
    },
    {
      title: ['Y luego, cocinad', 'juntos en persona.'],
      sub: 'Noches de cocina y comidas compartidas. Apúntate con un toque.',
    },
    {
      title: ['Trae a un amigo', 'con un enlace.'],
      sub: 'Puede echar un vistazo primero. Sin app.',
    },
  ],
  fr: [
    {
      title: ['Trouve ta communauté.', 'Cuisinez ensemble.'],
      sub: 'Un club de cuisine chaque semaine, près de chez toi.',
    },
    {
      title: ['Un thème par semaine.', 'Tout le monde cuisine.'],
      sub: 'Ton Circle le choisit. Tu le cuisines chez toi.',
    },
    {
      title: ['Montre ce que', 'tu as cuisiné.'],
      sub: 'Une photo et une phrase, rien que pour ton Circle.',
    },
    {
      title: ['Des idées fraîches', 'de ton Circle.'],
      sub: 'Vois ce que les autres ont cuisiné et demande comment.',
    },
    {
      title: ['Puis cuisinez ensemble,', 'en vrai.'],
      sub: 'Soirées cuisine et repas partagés. Inscris-toi en un geste.',
    },
    {
      title: ['Invite un ami', 'avec un seul lien.'],
      sub: 'Il peut jeter un œil d’abord. Sans appli.',
    },
  ],
  it: [
    {
      title: ['Trova la tua gente.', 'Cucinate insieme.'],
      sub: 'Un club di cucina settimanale con persone vicino a te.',
    },
    {
      title: ['Un tema a settimana.', 'Tutti cucinano.'],
      sub: 'Lo sceglie il tuo Circle. Tu lo cucini a casa.',
    },
    {
      title: ['Mostra cosa', 'hai cucinato.'],
      sub: 'Una foto e una frase, solo per il tuo Circle.',
    },
    {
      title: ['Idee fresche', 'dal tuo Circle.'],
      sub: 'Guarda cosa hanno cucinato gli altri e chiedi come.',
    },
    {
      title: ['Poi cucinate insieme,', 'dal vivo.'],
      sub: 'Serate in cucina e cene condivise. Partecipi con un tocco.',
    },
    {
      title: ['Porta un amico', 'con un link.'],
      sub: 'Può dare un’occhiata prima. Senza app.',
    },
  ],
  nl: [
    {
      title: ['Vind je mensen.', 'Kook samen.'],
      sub: 'Een wekelijkse kookclub met mensen bij jou in de buurt.',
    },
    {
      title: ['Eén thema per week.', 'Iedereen kookt mee.'],
      sub: 'Je Circle kiest het. Jij kookt het thuis.',
    },
    {
      title: ['Laat zien wat', 'je hebt gekookt.'],
      sub: 'Een foto en een zin, alleen voor je Circle.',
    },
    {
      title: ['Nieuwe ideeën', 'uit je Circle.'],
      sub: 'Zie wat anderen kookten en vraag hoe.',
    },
    {
      title: ['Kook daarna samen,', 'in het echt.'],
      sub: 'Kookavonden en potlucks. Met één tik erbij.',
    },
    {
      title: ['Neem een vriend mee', 'met één link.'],
      sub: 'Eerst rondkijken mag. Zonder app.',
    },
  ],
  pl: [
    {
      title: ['Znajdź swoich ludzi.', 'Gotujcie razem.'],
      sub: 'Cotygodniowy klub kulinarny z ludźmi z okolicy.',
    },
    {
      title: ['Jeden temat na tydzień.', 'Wszyscy gotują.'],
      sub: 'Twój Circle go wybiera. Ty gotujesz w domu.',
    },
    {
      title: ['Pokaż', 'swoje danie.'],
      sub: 'Zdjęcie i jedno zdanie, tylko dla Twojego Circle.',
    },
    {
      title: ['Świeże pomysły', 'z Twojego Circle.'],
      sub: 'Zobacz, co ugotowali inni, i zapytaj jak.',
    },
    {
      title: ['Potem gotujcie razem,', 'na żywo.'],
      sub: 'Wspólne gotowanie i potlucki. Dołączasz jednym dotknięciem.',
    },
    {
      title: ['Zaproś znajomych', 'jednym linkiem.'],
      sub: 'Mogą się najpierw rozejrzeć. Bez aplikacji.',
    },
  ],
  pt: [
    {
      title: ['Encontra a tua gente.', 'Cozinhem juntos.'],
      sub: 'Um clube de cozinha semanal com pessoas perto de ti.',
    },
    {
      title: ['Um tema por semana.', 'Todos cozinham.'],
      sub: 'O teu Circle escolhe. Tu cozinhas em casa.',
    },
    {
      title: ['Mostra o que', 'cozinhaste.'],
      sub: 'Uma foto e uma frase, só para o teu Circle.',
    },
    {
      title: ['Ideias novas', 'do teu Circle.'],
      sub: 'Vê o que os outros cozinharam e pergunta como.',
    },
    {
      title: ['Depois cozinhem juntos,', 'ao vivo.'],
      sub: 'Noites de cozinha e jantares partilhados. Junta-te com um toque.',
    },
    { title: ['Traz um amigo', 'com um só link.'], sub: 'Pode espreitar primeiro. Sem app.' },
  ],
};
