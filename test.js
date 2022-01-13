const Flowo = require("./flowo.js");

let getSymbolWord = (sym) =>
    [...sym.toString().matchAll(/\w+/g)].at(-1)?.toString() || sym.toString()

for(let s of [
    // "3",
    // "-3",
    // "f(3,4,6) + g(3) * -h()",
    // "1,2,3,5,6",
    // "1+2+3+4+5",
    // "A+B,C*D",
    // "3^4*5",
    // "5*3^4",
    "-3^4",
    "1+2*3",
    "atk<def and atk>0",
    // "[1,2,3,[4,5,6,[],[],[[]]]]",
]) {
    console.log("-".repeat(30));
    for(let token of Flowo.tokenize(s)) {
        console.log("  " + token.raw.padEnd(9) + " " + getSymbolWord(token.type));
    }
    for(let out of Flowo.shunt(Flowo.tokenize(s))) {
        let [ sym, ...args ] = out;
        console.log(getSymbolWord(sym).padEnd(12), args.map(JSON.stringify).join("\t"));
    }
    console.log("Evaluated:");
    console.log(
        Flowo.exec(s, {
            variables: { atk: 100, def: 3000 }
        })
    );
}
console.log("-".repeat(30));