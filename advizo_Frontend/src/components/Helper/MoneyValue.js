import { formatAmountHelper } from "./Helper";

// Currency symbol rendered smaller than the numeric value next to it.
// Usage:
//   <MoneyValue currency={currency} amount={500} />          → $500 (formatted)
//   <MoneyValue currency={currency}>{customText}</MoneyValue> → keeps caller's formatting
const symbolStyle = {
    fontSize: "0.65em",
    marginRight: "1px",
    opacity: 0.85,
};

export default function MoneyValue({ currency, amount, children }) {
    return (
        <span>
            <span style={symbolStyle}>{currency || "$"}</span>
            {children ?? formatAmountHelper(amount)}
        </span>
    );
}
