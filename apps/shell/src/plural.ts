// Un compte et son nom accordé : « 1 story », « 3 stories ».
export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`
