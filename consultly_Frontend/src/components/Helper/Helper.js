export const getDuration = (start, end) => {
    if (!start || !end) return "00:00";
    const diffMs = new Date(end) - new Date(start);
    if (diffMs <= 0) return "00:00";
    const diff = Math.floor(diffMs / 1000);
    const m = String(Math.floor(diff / 60)).padStart(2, '0');
    const s = String(diff % 60).padStart(2, '0');
    return `${m}:${s}`;
};


export const formatAmountHelper = (num) => {
    if (num === null || num === undefined) return "0";

    // Mongo Decimal128 / string / anything → number me convert
    const value = Number(num);

    if (isNaN(value)) return "0";

    // single digit OR below 1000 → normal number (no K)
    if (value < 1000) {
        return value % 1 === 0 ? value.toString() : value.toFixed(2);
    }

    if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1) + "B";
    if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
    if (value >= 1_000) return (value / 1_000).toFixed(1) + "K";

    return value.toString();
};
export const formatNumber = (value, decimals = 2) => {
    if (value === null || value === undefined) return 0;

    const num = Number(value);
    if (isNaN(num)) return 0;

    // integer value → return as is
    if (Number.isInteger(num)) {
        return num;
    }

    // decimal value → toFixed
    return Number(num.toFixed(decimals));
};

