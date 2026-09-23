export const scenarios = [
  "The office cake vanished from the break room at 3:00 PM.",
  "Someone replaced the principal's speech with karaoke lyrics before assembly.",
  "The museum's tiny golden spoon disappeared during the gala.",
  "A championship trophy was found full of pudding after practice.",
  "The neighborhood pizza order arrived with every slice mysteriously de-cheesed.",
  "The theater's fog machine was filled with bubble solution before opening night.",
  "A rare comic book went missing from the midnight release table.",
  "The library's quiet bell rang nonstop during finals week.",
  "Someone swapped the science fair volcano lava for glitter glue.",
  "The mayor's ceremonial ribbon was cut before the ceremony began."
];

export function randomScenario() {
  return scenarios[Math.floor(Math.random() * scenarios.length)];
}
