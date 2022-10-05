/* eslint-disable import/prefer-default-export */

/**
 * This template function going to remove identation from multi-line string.
 *
 * @param texts - The texts to be timed.
 * @param args - Template variable values.
 */
function tim(texts: TemplateStringsArray, ...args: string[]) {
  // Let's find identLevel
  let identLevel = -1; // eslint-disable-line @typescript-eslint/no-magic-numbers

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    const lines = text.split("\n");

    for (let j = 0; j < lines.length; j++) {
      // First line of first text is ignored.
      if (i === 0 && j === 0) {
        continue;
      }

      // Last line of last text is ignored.
      if (i === texts.length - 1 && j === lines.length - 1) {
        continue;
      }

      const line = lines[j];

      // Convert any tabs to whitespaces
      const lineNoTabs = line.replace(/\t/g, "  ");
      const match = (/^ +/).exec(lineNoTabs);

      if (match) {
        const count = match[0].length;

        if (identLevel < 0 || count < identLevel) {
          identLevel = count;
        }
      }
    }
  }

  // Let's remove identLevel
  const ident = new Array(identLevel).fill(" ").join("");
  const identRgx = new RegExp(`^${ident}`);
  const textsNoIdent = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    const lines = text.split("\n");
    const linesNoIdent = [];

    for (let j = 0; j < lines.length; j++) {
      // First line of first text is ignored.
      if (i === 0 && j === 0) {
        continue;
      }

      // Last line of last text is ignored.
      if (i === texts.length - 1 && j === lines.length - 1) {
        continue;
      }

      linesNoIdent.push(lines[j].replace(identRgx, ""));
    }

    textsNoIdent.push(linesNoIdent.join("\n"));
  }

  // Add arguments
  if (!args || !args.length) {
    return textsNoIdent.join("");
  }

  // Join args
  const textsWithArgs = [];

  for (const text of textsNoIdent) {
    textsWithArgs.push(text);

    if (args.length) {
      textsWithArgs.push(args.shift());
    }
  }

  return textsWithArgs.join("");
}

//#####################################################
// Exports
//#####################################################
export {
  tim,
};
