// As the design draws them: the first letters of the first two words ("aile-gauche" → AG), else the name's first
// two letters ("centreur" → CE, "relance-42" → RE).
export function playerInitials(name: string): string {
  const words = name.split(/[-_.\s]+/).filter((word) => /^\p{L}/u.test(word));
  const [first, second] = words;
  if (first && second) return (first.charAt(0) + second.charAt(0)).toUpperCase();
  return (first ?? name).slice(0, 2).toUpperCase();
}
