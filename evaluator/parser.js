const fs = require('fs');
const slug = require('slug');

function getIDFromString(str) {
    return slug(str, { lower: true });
}

function getRuleField(rule, field) {
    if(rule.hasOwnProperty(field)) {
        return rule[field];
    }
    else {
        return null;
    }
}

function parseFlags(file) {
    // Leer archivo
    let rawdata = fs.readFileSync(file);

    // Parsear archivo
    let rules = JSON.parse(rawdata);

    // Construir rulesObj
    let rulesArr = [];
    rules.map( (rule) => {
        var ruleObj = {
            id: getIDFromString(rule.name),
            name: rule.name,
            category: rule.category,
            categoryID: getIDFromString(rule.category),
            flagType: rule.type,
            fields: getRuleField(rule, 'fields'), // VALIDAR
            values: getRuleField(rule, 'values'), // VALIDAR
            dates: getRuleField(rule, 'dates'), // VALIDAR
            difference: getRuleField(rule, 'difference'), // VALIDAR
        };

        rulesArr.push(ruleObj);
    } );

    return rulesArr;
}

function getCriteriaObject(flags) {
    var criteriaArr = [];
    flags.map( (flag) => {
        if( !criteriaArr.includes(flag.categoryID) ) {
            criteriaArr.push(flag.categoryID);
        }
    } );

    var criteriaObj = { total_score: 0 };
    criteriaArr.map( (item) => {
        criteriaObj[item] = 0;
    } );
    criteriaObj['total_score'] = 0;

    return criteriaObj;
}

module.exports = { parseFlags, getCriteriaObject };
