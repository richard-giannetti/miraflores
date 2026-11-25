// Airbnb reviews of Villa Los Olivos, copied from the listing (5-star reviews only).
// Shown on both villas for now; Villa La Playa's pages label them as the sister villa's.
// To update: add or replace entries below, and refresh the rating numbers from the listing.

export const airbnbRating = {
  villa: "villa-los-olivos",
  listing: "https://airbnb.com/h/losolivosmiraflores",
  overall: 4.95,
  count: 20,
  guestFavourite: true,
  categories: {
    cleanliness: 5.0,
    accuracy: 5.0,
    checkIn: 5.0,
    communication: 5.0,
    location: 4.7,
    value: 4.9,
  },
};

export interface Review {
  author: string;
  date: string; // YYYY-MM
  text: string;
  // Airbnb showed it translated into English.
  translated?: boolean;
}

export const reviews: Review[] = [
  {
    author: "Julie",
    date: "2026-08",
    translated: true,
    text: "We had a great time in this beautiful villa. The house is just sublime and very pleasant, not to mention the breathtaking view and the kindness of the hosts. Thank you very much for a lovely stay",
  },
  {
    author: "Rachel Jade",
    date: "2026-05",
    text: "We had a fantastic stay at Villa Los Olivos! The villa was the perfect size for the eleven of us - spacious rooms, each with their own en-suite, and a very well-equipped kitchen. Jean-Pierre was incredibly welcoming and very quick to respond to any questions we had.",
  },
  {
    author: "Shawn",
    date: "2025-09",
    text: "The house was amazing. The layout was great; open kitchen, dining room, and living room all connected and filled with light from huge windows with an incredible view overlooking the town and sea. The architecture and design was done with such great taste. Spacious and everything was new in the house. The bedrooms and baths were terrific. The outside was equally amazing with an infinity pool, sauna, and hottub. All with incredible views in a quiet setting up on the mountainside. The photos don’t do the place justice. Good location for day trips: we went to the beach in Nerja, explored Frigiliana, hiking in the Sierra Nevada, Alhambra in Granada, and visited the mountain towns in the Alpujarras. JP and his wife were so nice and were very attentive. They addressed the one issue we had. Our stay was way too short.",
  },
  {
    author: "Michel",
    date: "2025-07",
    text: "This villa is magnificent. The oweners/hosts are amazing, Motril is a great little town and the view is breath-taking. This is a large villa, 14 sleeps, the largest dinner table you could possibly find in an airbnb villa in spain with a breath-taking view of the coast. We are planning to revisit this villa in the near future. A massive thank you to Jean-Pierre who triple-checked the pool to make sure it was perfectly safe for the children. (Salt water pool btw). Regards. Michel",
  },
  {
    author: "Jan",
    date: "2025-10",
    text: "Jean-Pierre was a great and calm host. The House was amazing with an incredible view and the pool is refreshing. Everytime we had a question, Jean Pierre took Action and helped us. I say thank you for this week, which made great memories for everybody of us. Best regards, Jan",
  },
  {
    author: "Levani",
    date: "2025-08",
    translated: true,
    text: "The villa is absolutely superb, everything is there: absolute calm, great comfort, breathtaking views! We are unanimous: the services are even better than we imagined from the photos! We all highly recommend ☀️",
  },
  {
    author: "Sofia",
    date: "2026-07",
    translated: true,
    text: "The place was very clean, beautiful and in a quiet location. No disturbances from neighbors. You can really be alone. The accommodation is equipped with everything you could possibly need. There's nothing missing. We are very satisfied all around. The only thing that's not quite optimal if you want to do more or walk is the location. Everything is accessible only by car and is further away from the accommodation. Depending on your expectations, but ideal if you just want to have your peace and quiet and have a good time in a good place to stay.",
  },
  {
    author: "James",
    date: "2025-08",
    text: "Fantastic stay with friends, the 13 of us had a great time. We had hire cars so getting around was easy. WiFi was quite slow but understandable given the location! Views were stunning and never got old. Plenty to do at the AirBnb including pool, sauna, jacuzzi so would find ourselves rarely needing to go out for things to do. All in all, a lovely week to switch off and the hosts were friendly and attentive during our stay 😄",
  },
  {
    author: "Silvio Oscar",
    date: "2026-08",
    translated: true,
    text: "Thank you. It's a very nice space for family gatherings and get-togethers with friends",
  },
];
