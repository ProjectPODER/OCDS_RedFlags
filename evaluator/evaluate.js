const {
    checkAllFieldsFlag,
    checkComprensibilityFlag,
    checkDatesFlag,
    checkFieldsComparisonFlag,
    checkFieldsFlag,
    checkFieldsValueFlag,
    checkNotFieldsFlag,
    checkSchemaFlag,
    checkSectionsFlag,
    checkUrlFieldFlag,
    dateDifferenceFlag
} = require('./redFlags/redFlags');
const launder = require('company-laundry');
const removeDiacritics = require('diacritics').remove;
const _ = require('lodash');

function simpleName(string) {
  return removeDiacritics(string)
    .replace(/[,.]/g, '') // remove commas and periods
    .toLowerCase();
}

function getContractYear(contract) {
    let startDate = contract.contracts[0].period.startDate.toISOString();
    return startDate.split('-')[0];
}

function getFlagScore(contract, flag) {
    switch(flag.flagType) {
        case 'check-all-fields-rate':
            return checkAllFieldsFlag();
            break;
        case 'check-dates-bool':
            return checkDatesFlag();
            break;
        case 'check-field-value-bool':
            return checkFieldsValueFlag();
            break;
        case 'check-fields-bool':
            return checkFieldsFlag(contract, flag.fields);
            break;
        case 'check-fields-inverse':
            return checkNotFieldsFlag(contract, flag.fields);
            break;
        case 'check-schema-bool':
            return checkSchemaFlag();
            break;
        case 'check-sections-bool':
            return checkSectionsFlag(contract, flag.fields);
            break;
        case 'check-url-bool':
            return checkUrlFieldFlag(contract, flag.fields);
            break;
        case 'comprensibility':
            return checkComprensibilityFlag();
            break;
        case 'date-difference-bool':
            return dateDifferenceFlag();
            break;
        case 'field-equality-bool':
            return checkFieldsComparisonFlag(contract, flag.fields);
            break;
    }
}

function evaluateFlags(contract, flags, flagCollectionObj) {
    let year = getContractYear(contract);

    let contratoFlags = JSON.parse(JSON.stringify(flagCollectionObj));
    contratoFlags.type = 'contract';
    delete contratoFlags.id;
    delete contratoFlags.name;
    delete contratoFlags.entity;

    Object.assign(contratoFlags, { ocid: contract.ocid });

    if( contract.contracts[0].hasOwnProperty('dateSigned') ) {
        Object.assign(contratoFlags, { date_signed: contract.contracts[0].dateSigned });
    }
    if( contract.hasOwnProperty('source') ) {
        Object.assign(contratoFlags, { source: contract.source });
    }

    // Obtenemos los parties del objeto parties del contrato
    let contratoParties = [];
    contract.parties.map( (party) => {
        var role = party.hasOwnProperty('role')? party.role : party.roles;

        var partyObj = {
            id: party.id,
            name: party.name,
            entity: role
        }
        contratoParties.push(partyObj);

        // Del party con rol de buyer (la UC) sacamos la dependencia (el parent) y el estado o municipio
        if(role == 'buyer') {
            // Sacamos la dependencia del parent

            if (party.hasOwnProperty('parent') || party.hasOwnProperty('memberOf') ) {
              
              var nombreDependencia = party.hasOwnProperty('parent')? party.parent : party.memberOf.name;

              var dependencyObj = {
                id: simpleName(launder(nombreDependencia)),
                name: nombreDependencia,
                entity: 'dependency'
              }
              contratoParties.push(dependencyObj);
            }

            // Sacamos estado si el govLevel es "region", si es "city" sacamos municipio y estado también
            switch(party.govLevel) {
                case 'region':
                    var stateObj = {
                        id: simpleName(launder(party.address.region)),
                        name: party.address.region,
                        entity: 'state'
                    }
                    contratoParties.push(stateObj);
                    break;
                case 'city':
                    var cityObj = {
                        id: simpleName(launder(party.address.locality)),
                        name: party.address.locality,
                        entity: 'municipality'
                    }
                    contratoParties.push(cityObj);
                    break;
                case 'country':
                    // No se hace nada a nivel de país...
                    break;
            }
        }
    } );

    // Iterar sobre las reglas
    flags.map( (flag) => {
        let flagScore = getFlagScore(contract, flag);
        contratoFlags.flags[flag.categoryID][flag.id].push({ year: year, score: flagScore });
    } );

    // Agregar los parties al contrato
    Object.assign(contratoFlags, { parties: contratoParties });

    return { contratoFlags, year };
}

module.exports = evaluateFlags;
