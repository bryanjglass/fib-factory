/**
 * The Fib Factory question bank.
 *
 * SERVER-ONLY. This module is bundled into the Cloudflare Worker and must never
 * be imported from `client/` — that is what keeps answers out of browsers.
 *
 * Every question contains a single blank (`_____`) and exactly one correct
 * answer. `alsoAccept` lists equivalent spellings; it is only used to reject a
 * fib that is really the truth in disguise (e.g. "3" vs "three"). It never
 * creates a second correct answer on the ballot.
 */

export interface Question {
  id: string;
  text: string;
  answer: string;
  alsoAccept?: string[];
  /** A short follow-up shown on the TV after the truth is revealed. */
  fact?: string;
}

export const QUESTIONS: readonly Question[] = [
  {
    id: 'q01',
    text: 'A group of flamingos is called a _____.',
    answer: 'flamboyance',
    fact: 'Flamingos get their pink color from the shrimp and algae they eat.',
  },
  {
    id: 'q02',
    text: 'An octopus has _____ hearts.',
    answer: 'three',
    alsoAccept: ['3'],
    fact: 'Two hearts pump blood to the gills, and one pumps it to the rest of the body.',
  },
  {
    id: 'q03',
    text: 'Wombats are famous for producing poop shaped like _____.',
    answer: 'cubes',
    alsoAccept: ['cube', 'little cubes', 'squares'],
    fact: 'The cubes help keep their droppings from rolling away from where they mark territory.',
  },
  {
    id: 'q04',
    text: 'The official national animal of Scotland is the _____.',
    answer: 'unicorn',
    fact: 'The unicorn has been a Scottish heraldic symbol since the 1300s.',
  },
  {
    id: 'q05',
    text: 'The little dot above a lowercase "i" or "j" is called a _____.',
    answer: 'tittle',
  },
  {
    id: 'q06',
    text: 'The plastic tip on the end of a shoelace is called an _____.',
    answer: 'aglet',
  },
  {
    id: 'q07',
    text: 'Before it was named Google, the search engine was called _____.',
    answer: 'BackRub',
    alsoAccept: ['back rub'],
    fact: 'The name came from the way it analyzed "back links" between web pages.',
  },
  {
    id: 'q08',
    text: 'The very first item ever sold on eBay was a broken _____.',
    answer: 'laser pointer',
    fact: 'It sold for $14.83 in 1995 to a buyer who collected broken laser pointers.',
  },
  {
    id: 'q09',
    text: 'In Switzerland, it is against animal-welfare rules to keep just one _____, because they get lonely.',
    answer: 'guinea pig',
    alsoAccept: ['guinea pigs'],
  },
  {
    id: 'q10',
    text: "A shrimp's heart is located in its _____.",
    answer: 'head',
  },
  {
    id: 'q11',
    text: 'Walter Morrison, inventor of a famous flying toy, asked for his ashes to be made into _____.',
    answer: 'a Frisbee',
    alsoAccept: ['frisbees', 'flying discs', 'flying disc'],
  },
  {
    id: 'q12',
    text: 'Fredric Baur, the chemist who designed a famous potato chip container, had his ashes buried in _____.',
    answer: 'a Pringles can',
    alsoAccept: ['pringles cans', 'pringles can'],
  },
  {
    id: 'q13',
    text: 'In the 1830s, tomato ketchup was sold in America as a _____.',
    answer: 'medicine',
    alsoAccept: ['medication', 'cure', 'remedy'],
    fact: 'Ketchup pills were sold to treat indigestion.',
  },
  {
    id: 'q14',
    text: "An ostrich's eye is bigger than its _____.",
    answer: 'brain',
  },
  {
    id: 'q15',
    text: 'Butterflies taste their food using their _____.',
    answer: 'feet',
    alsoAccept: ['foot'],
  },
  {
    id: 'q16',
    text: 'Cleopatra lived closer in time to the _____ than to the building of the Great Pyramid of Giza.',
    answer: 'Moon landing',
    alsoAccept: ['first moon landing', 'apollo 11'],
  },
  {
    id: 'q17',
    text: 'Teaching at Oxford University began before the founding of the _____ capital city of Tenochtitlan.',
    answer: 'Aztec',
    alsoAccept: ['aztecs'],
    fact: 'Oxford was teaching students by 1096; Tenochtitlan was founded in 1325.',
  },
  {
    id: 'q18',
    text: 'The only U.S. state whose name can be typed using just one row of a standard keyboard is _____.',
    answer: 'Alaska',
  },
  {
    id: 'q19',
    text: 'When Nintendo was founded in 1889, it made _____.',
    answer: 'playing cards',
    alsoAccept: ['cards', 'card games', 'hanafuda cards'],
  },
  {
    id: 'q20',
    text: 'The name LEGO comes from the Danish words "leg godt," which mean "_____."',
    answer: 'play well',
  },
  {
    id: 'q21',
    text: 'Bubble Wrap was originally invented to be sold as _____.',
    answer: 'wallpaper',
    alsoAccept: ['textured wallpaper'],
  },
  {
    id: 'q22',
    text: 'Before it became a toy, Play-Doh was sold as a _____.',
    answer: 'wallpaper cleaner',
    alsoAccept: ['cleaner for wallpaper'],
  },
  {
    id: 'q23',
    text: 'A group of owls is called a _____.',
    answer: 'parliament',
  },
  {
    id: 'q24',
    text: "In 1932, Australia's military fought a so-called war against _____ — and lost.",
    answer: 'emus',
    alsoAccept: ['emu'],
    fact: 'It is remembered as the Great Emu War.',
  },
  {
    id: 'q25',
    text: "The world's first webcam, at Cambridge University, was pointed at a _____.",
    answer: 'coffee pot',
    alsoAccept: ['coffeepot', 'coffee maker'],
    fact: 'Researchers used it to check whether the coffee pot was empty before walking over.',
  },
  {
    id: 'q26',
    text: 'The very first video uploaded to YouTube was filmed at a _____.',
    answer: 'zoo',
    fact: 'The 2005 video is called "Me at the zoo."',
  },
  {
    id: 'q27',
    text: 'Koalas have _____ so similar to humans that they could confuse a crime scene investigator.',
    answer: 'fingerprints',
    alsoAccept: ['fingerprint', 'finger prints'],
  },
  {
    id: 'q28',
    text: 'Under all that white fur, a polar bear\'s skin is _____.',
    answer: 'black',
  },
  {
    id: 'q29',
    text: "England and France's Hundred Years' War actually lasted _____ years.",
    answer: '116',
    alsoAccept: ['one hundred sixteen', 'one hundred and sixteen'],
  },
  {
    id: 'q30',
    text: 'A cat has _____ muscles in each ear.',
    answer: '32',
    alsoAccept: ['thirty two', 'thirty-two'],
  },
  {
    id: 'q31',
    text: 'Mr. Potato Head was the first toy ever advertised on _____.',
    answer: 'television',
    alsoAccept: ['tv'],
  },
  {
    id: 'q32',
    text: 'Monopoly is based on a 1904 board game called The _____\'s Game.',
    answer: 'Landlord',
    fact: 'It was created by Lizzie Magie to show the problems with land monopolies.',
  },
  {
    id: 'q33',
    text: 'The # symbol is officially called an _____.',
    answer: 'octothorpe',
    alsoAccept: ['octothorp'],
  },
  {
    id: 'q34',
    text: 'The "Q" in Q-tips stands for _____.',
    answer: 'quality',
  },
  {
    id: 'q35',
    text: 'The blue bird in the original Twitter logo was named _____.',
    answer: 'Larry',
    fact: 'He was named after basketball legend Larry Bird.',
  },
  {
    id: 'q36',
    text: 'Born around 1832, a giant tortoise in Saint Helena named _____ became the oldest known living land animal.',
    answer: 'Jonathan',
  },
  {
    id: 'q37',
    text: 'Peanuts are not actually nuts — they are _____.',
    answer: 'legumes',
    alsoAccept: ['legume', 'beans', 'peas'],
  },
  {
    id: 'q38',
    text: 'Abraham Lincoln is a member of the National _____ Hall of Fame.',
    answer: 'Wrestling',
    fact: 'Lincoln reportedly lost only one of roughly 300 matches.',
  },
  {
    id: 'q39',
    text: 'Every winter, a hotel in northern Sweden is rebuilt entirely out of _____.',
    answer: 'ice',
    alsoAccept: ['ice and snow', 'snow and ice', 'snow'],
  },
  {
    id: 'q40',
    text: 'A water tower in Collinsville, Illinois, is shaped like a giant _____.',
    answer: 'ketchup bottle',
    alsoAccept: ['catsup bottle'],
  },
  {
    id: 'q41',
    text: 'The town of Boring, Oregon, is officially paired with the Scottish village of _____.',
    answer: 'Dull',
  },
  {
    id: 'q42',
    text: 'In colonial New England, lobster was considered such a lowly food that it was fed to _____.',
    answer: 'prisoners',
    alsoAccept: ['prisoner', 'inmates', 'servants'],
  },
  {
    id: 'q43',
    text: 'Before the 1600s, most cultivated carrots were _____ or yellow.',
    answer: 'purple',
  },
  {
    id: 'q44',
    text: 'Look closely: the Mona Lisa has no _____.',
    answer: 'eyebrows',
    alsoAccept: ['eyebrow', 'brows'],
  },
  {
    id: 'q45',
    text: 'The jellyfish Turritopsis dohrnii is nicknamed the "_____ jellyfish."',
    answer: 'immortal',
    fact: 'It can revert to an earlier stage of its life cycle when stressed.',
  },
  {
    id: 'q46',
    text: 'By surface area, Russia is bigger than the dwarf planet _____.',
    answer: 'Pluto',
  },
  {
    id: 'q47',
    text: 'In seahorses, it is the _____ who gives birth to the babies.',
    answer: 'dad',
    alsoAccept: ['father', 'male', 'males', 'daddy'],
  },
  {
    id: 'q48',
    text: 'The full official name of the Statue of Liberty is "Liberty _____ the World."',
    answer: 'Enlightening',
  },
  {
    id: 'q49',
    text: 'In 1905, an 11-year-old boy accidentally invented the _____ by leaving a drink outside on a cold night.',
    answer: 'Popsicle',
    alsoAccept: ['popsicles', 'ice pop', 'ice lolly'],
  },
  {
    id: 'q50',
    text: 'In 1873, a 15-year-old from Maine invented _____ to keep warm while ice skating.',
    answer: 'earmuffs',
    alsoAccept: ['ear muffs', 'ear protectors'],
  },
  {
    id: 'q51',
    text: 'During the Apollo 14 mission, astronaut Alan Shepard hit _____ golf balls on the Moon.',
    answer: 'two',
    alsoAccept: ['2'],
  },
  {
    id: 'q52',
    text: 'An Iowa man named Charles Osborne had the hiccups for _____ years.',
    answer: '68',
    alsoAccept: ['sixty eight', 'sixty-eight'],
  },
  {
    id: 'q53',
    text: 'From east to west, Australia is wider than the _____.',
    answer: 'Moon',
  },
  {
    id: 'q54',
    text: "The fleshy flap that hangs over a turkey's beak is called a _____.",
    answer: 'snood',
  },
  {
    id: 'q55',
    text: 'Sharks have existed on Earth longer than _____.',
    answer: 'trees',
    alsoAccept: ['tree'],
    fact: 'Sharks appeared about 450 million years ago; the first trees about 385 million years ago.',
  },
  {
    id: 'q56',
    text: 'The actor who voiced Mickey Mouse for over 30 years married the actress who voiced _____.',
    answer: 'Minnie Mouse',
    alsoAccept: ['minnie'],
  },
  {
    id: 'q57',
    text: 'Woolly mammoths were still alive when the Great _____ of Giza was being built.',
    answer: 'Pyramid',
    alsoAccept: ['pyramids'],
  },
  {
    id: 'q58',
    text: 'In Finland, there is a world championship for _____ carrying.',
    answer: 'wife',
    alsoAccept: ['wives'],
  },
  {
    id: 'q59',
    text: "In England's Cooper's Hill race, people chase a rolling wheel of _____ down a steep hill.",
    answer: 'cheese',
    alsoAccept: ['double gloucester', 'double gloucester cheese'],
  },
  {
    id: 'q60',
    text: 'Every year, the Italian town of Ivrea holds a huge food fight called the Battle of the _____.',
    answer: 'Oranges',
    alsoAccept: ['orange'],
  },
  {
    id: 'q61',
    text: 'The Norwegian King\'s Guard has knighted a _____ named Sir Nils Olav.',
    answer: 'penguin',
    alsoAccept: ['king penguin'],
  },
  {
    id: 'q62',
    text: 'For about 20 years, a cat named Stubbs was the honorary _____ of Talkeetna, Alaska.',
    answer: 'mayor',
  },
  {
    id: 'q63',
    text: 'A group of jellyfish can be called a _____.',
    answer: 'smack',
    alsoAccept: ['bloom', 'swarm'],
  },
  {
    id: 'q64',
    text: 'Honeybees tell each other where to find flowers by doing a _____.',
    answer: 'waggle dance',
    alsoAccept: ['dance', 'waggle'],
  },
  {
    id: 'q65',
    text: 'Dolphins can sleep with one _____ open.',
    answer: 'eye',
  },
];

export function getQuestion(id: string): Question | undefined {
  return QUESTIONS.find((q) => q.id === id);
}
