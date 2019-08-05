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
    let startDate = '';

    if ( Object.prototype.toString.call(contract.contracts[0].period.startDate) === "[object Date]" )
        startDate = contract.contracts[0].period.startDate.toISOString();
    else
        startDate = contract.contracts[0].period.startDate;

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
            return checkFieldsValueFlag(contract, flag.fields, flag.values);
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
            return checkComprensibilityFlag(contract, flag.fields);
            break;
        case 'date-difference-bool':
            return dateDifferenceFlag(contract, flag.fields, flag.difference);
            break;
        case 'field-equality-bool':
            return checkFieldsComparisonFlag(contract, flag.fields);
            break;
    }
}

function getContractsFromRecord(record) {
    let contracts = [];
    record.contracts.map( (contract) => {
        let buyer_id = record.buyer.id;
        let buyer_party = record.parties.filter( (party) => party.id == buyer_id )[0];
        let award_id = contract.awardID;
        let award = record.awards.filter( (award) => award.id == award_id )[0];
        let supplier_ids = [];
        award.suppliers.map( (supplier) => supplier_ids.push(supplier.id) );
        let supplier_parties = record.parties.filter( (party) => supplier_ids.indexOf(party.id) >= 0 );

        let computed_contract = {};
        for( var x in record ) {
            switch(x) {
                case 'parties':
                    if(buyer_party)
                        computed_contract.parties = [ buyer_party ];
                    else
                        computed_contract.parties = [];
                    if(supplier_parties.length > 0)
                        supplier_parties.map( (supplier) => computed_contract.parties.push(supplier) );
                    break;
                case 'awards':
                    computed_contract.awards = [ award ];
                    break;
                case 'contracts':
                    computed_contract.contracts = [ contract ];
                    break;
                case 'dataSource':
                case 'total_amount':
                    // Ignore these properties if present, not part of OCDS
                    break;
                default:
                    computed_contract[x] = record[x];
                    break;
            }
        }

        contracts.push(computed_contract);
    } );

    return contracts;
}

function evaluateFlags(record, flags, flagCollectionObj) {
    let contracts = getContractsFromRecord(record);
    let results = [];
    let tempFlags = JSON.stringify(flagCollectionObj);

    // Iterate over all contracts in the document, creating a separate evaluation for each...
    contracts.map( (contract) => {
        let year = getContractYear(contract);
        let contratoFlags = JSON.parse(tempFlags);
        contratoFlags.type = 'contract';

        delete contratoFlags.name;
        delete contratoFlags.entity;

        Object.assign(contratoFlags, { id: contract.contracts[0].id });
        Object.assign(contratoFlags, { ocid: contract.ocid });
        Object.assign(contratoFlags, { value: contract.contracts[0].value });

        if( contract.contracts[0].hasOwnProperty('period') ) {
            Object.assign(contratoFlags, { date_signed: contract.contracts[0].period.startDate });
        }

        let contratoParties = [];
        contract.parties.map( (party) => {
            var role = party.hasOwnProperty('role')? party.role : party.roles[0];

            if(role == 'funder') {
                if(party.id.indexOf(';') > -1) {
                    var ids = party.id.split(';');
                    var names = party.name.split(';');

                    ids.map( (id, index) => {
                        var funderObj = {
                            id: id,
                            name: names[index],
                            entity: role
                        }
                        contratoParties.push(funderObj);
                    } );
                }
                else {
                    var partyObj = {
                        id: party.id,
                        name: party.name,
                        entity: role
                    }
                }
            }
            else {
                var partyObj = {
                    id: party.id,
                    name: party.name,
                    entity: role
                }
            }

            // From the party with a role of "buyer" (Unidad Compradora) we extract its parent (Dependencia) and the state or municipality it belongs to
            if(role == 'buyer') {
                // Get the parent (Dependencia)
                if ( party.hasOwnProperty('memberOf') ) {
                  var dependencyObj = {
                    id: party.memberOf[0].id,
                    name: party.memberOf[0].name,
                    entity: 'dependency'
                  }
                  contratoParties.push(dependencyObj);
                }

                Object.assign( partyObj, { parent: { id: party.memberOf[0].id, name: party.memberOf[0].name } } );

                // If the govLevel is "region", extract the state
                // If the govLevel is "city", extract the municipality and the state
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
                            parent: { id: simpleName(launder(party.address.region)), name: party.address.region },
                            entity: 'municipality'
                        }
                        contratoParties.push(cityObj);
                        break;
                    case 'country':
                        // Nothing to be done at country level...
                        break;
                }
            }
            if(partyObj) {
                contratoParties.push(partyObj);
            }
        } );

        // Iterate flags
        flags.map( (flag) => {
            let flagScore = getFlagScore(contract, flag);
            contratoFlags.flags[flag.categoryID][flag.id].push({ year: year, score: flagScore });
        } );

        // Add parties to this contract
        Object.assign(contratoFlags, { parties: contratoParties });

        results.push( { contratoFlags, year } );
    } );

    return results;
}

module.exports = evaluateFlags;
