# Flowo
## A simple, extensible testing language

## Example usage

```
const Flowo = require("flowo");
let code = "atk < def and atk > 0";
let result = Flowo.evaluate(Flowo.shunt(Flowo.tokenize(code)), {
        variables: { atk: 100, def: 3000 }
});
console.log(result); // true
```