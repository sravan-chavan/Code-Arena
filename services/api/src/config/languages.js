/**
 * Languages the CodeArena UI currently exposes.
 *
 * Judge0 language IDs are the official Judge0 CE 1.13.0 catalog values
 * (GET /languages on a stock CE instance). Do not invent IDs.
 *
 *   71  Python (3.8.1)
 *   54  C++ (GCC 9.2.0)
 *   62  Java (OpenJDK 13.0.1)
 *   63  JavaScript (Node.js 12.14.0)
 */

const LANGUAGES = Object.freeze([
  Object.freeze({
    slug: 'python',
    label: 'Python 3',
    judge0Id: 71,
    monaco: 'python',
    templates: Object.freeze({
      hello: 'print("Hello CodeArena")\n',
      sum: 'a, b = map(int, input().split())\nprint(a + b)\n',
      reverse: 'print(input().strip()[::-1])\n',
      compileError: 'def (\n',
      runtimeError: 'print(undefined_name)\n',
      timeout: 'while True:\n    pass\n',
    }),
  }),
  Object.freeze({
    slug: 'cpp',
    label: 'C++ 17',
    judge0Id: 54,
    monaco: 'cpp',
    templates: Object.freeze({
      hello: '#include <iostream>\nint main() {\n  std::cout << "Hello CodeArena" << std::endl;\n  return 0;\n}\n',
      sum: '#include <iostream>\nint main() {\n  int a, b;\n  std::cin >> a >> b;\n  std::cout << (a + b) << std::endl;\n  return 0;\n}\n',
      reverse: '#include <iostream>\n#include <string>\n#include <algorithm>\nint main() {\n  std::string s;\n  std::cin >> s;\n  std::reverse(s.begin(), s.end());\n  std::cout << s << std::endl;\n  return 0;\n}\n',
    }),
  }),
  Object.freeze({
    slug: 'java',
    label: 'Java 11',
    judge0Id: 62,
    monaco: 'java',
    templates: Object.freeze({
      hello: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello CodeArena");\n  }\n}\n',
      sum: 'import java.util.Scanner;\npublic class Main {\n  public static void main(String[] args) {\n    Scanner in = new Scanner(System.in);\n    int a = in.nextInt();\n    int b = in.nextInt();\n    System.out.println(a + b);\n  }\n}\n',
      reverse: 'import java.util.Scanner;\npublic class Main {\n  public static void main(String[] args) {\n    Scanner in = new Scanner(System.in);\n    String s = in.next();\n    System.out.println(new StringBuilder(s).reverse());\n  }\n}\n',
    }),
  }),
  Object.freeze({
    slug: 'javascript',
    label: 'JavaScript (Node)',
    judge0Id: 63,
    monaco: 'javascript',
    templates: Object.freeze({
      hello: 'console.log("Hello CodeArena");\n',
      sum: 'const fs = require("fs");\nconst [a, b] = fs.readFileSync(0, "utf8").trim().split(/\\s+/).map(Number);\nconsole.log(a + b);\n',
      reverse: 'const fs = require("fs");\nconst s = fs.readFileSync(0, "utf8").trim();\nconsole.log(s.split("").reverse().join(""));\n',
      runtimeError: 'console.log(undefinedName);\n',
    }),
  }),
]);

const BY_SLUG = Object.freeze(Object.fromEntries(LANGUAGES.map((language) => [language.slug, language])));

function listLanguages() {
  return LANGUAGES.map((language) => ({
    slug: language.slug,
    label: language.label,
    judge0Id: language.judge0Id,
    template: language.templates.hello,
  }));
}

function getLanguageBySlug(slug) {
  return BY_SLUG[slug] || null;
}

module.exports = {
  LANGUAGES,
  listLanguages,
  getLanguageBySlug,
};
