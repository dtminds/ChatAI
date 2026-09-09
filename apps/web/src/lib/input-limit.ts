export function limitInputEdit(previousValue: string, nextValue: string, maxLength: number) {
  if (nextValue.length <= maxLength) {
    return nextValue;
  }

  const nextCharacters = Array.from(nextValue);
  const previousCharacters = Array.from(previousValue);
  let prefixLength = 0;
  while (
    prefixLength < previousCharacters.length
    && prefixLength < nextCharacters.length
    && previousCharacters[prefixLength] === nextCharacters[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < previousCharacters.length - prefixLength
    && suffixLength < nextCharacters.length - prefixLength
    && previousCharacters[previousCharacters.length - suffixLength - 1]
      === nextCharacters[nextCharacters.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  const prefix = nextCharacters.slice(0, prefixLength);
  const suffix = nextCharacters.slice(nextCharacters.length - suffixLength);
  const insertedCharacters = nextCharacters.slice(
    prefixLength,
    nextCharacters.length - suffixLength,
  );
  if (previousValue.length > maxLength && insertedCharacters.length === 0) {
    return nextValue;
  }

  const retainedLength = getCharactersLength(prefix) + getCharactersLength(suffix);
  if (retainedLength > maxLength) {
    return truncateInputValue(nextValue, maxLength);
  }

  const acceptedCharacters = takeCharactersWithinLength(
    insertedCharacters,
    maxLength - retainedLength,
  );
  if (
    insertedCharacters.length > 0
    && acceptedCharacters.length === 0
    && previousValue.length <= maxLength
  ) {
    return previousValue;
  }

  return [
    ...prefix,
    ...acceptedCharacters,
    ...suffix,
  ].join("");
}

export function truncateInputValue(value: string, maxLength: number) {
  return takeCharactersWithinLength(Array.from(value), maxLength).join("");
}

function getCharactersLength(characters: string[]) {
  return characters.reduce((length, character) => length + character.length, 0);
}

function takeCharactersWithinLength(characters: string[], maxLength: number) {
  const acceptedCharacters: string[] = [];
  let acceptedLength = 0;

  for (const character of characters) {
    if (acceptedLength + character.length > maxLength) {
      break;
    }
    acceptedCharacters.push(character);
    acceptedLength += character.length;
  }

  return acceptedCharacters;
}
