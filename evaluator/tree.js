function createOrgTree() {
    return {
        roots: {}
    }
}

function updateOrgTree(roots, contract) {
    // Data from contracts:
    //      dependencyID
    //      ucID
    //      procmethod
    //      funders[]
    //          id
    //      suppliers[]
    //          id
    //          contract
    //              year
    //              date
    //              title
    //              amount
    let data = extractDataFromContract(contract);
    // TODO: refactor
    // Funders and buyer in the same array

    // Get UC or create it if not seen yet
    if(!branchExists(roots, data.ucID)) addBranch(roots, data.ucID, data.dependencyID);
    let branch = roots[data.ucID];

    let f_branches = [];
    if(data.funders.length > 0) {
        data.funders.map( (funder) => {
            if(!branchExists(roots, funder)) addBranch(roots, funder, null);
            f_branches.push(roots[funder]);
        } );
    }

    // Get suppliers
    data.suppliers.map( (supplier) => {
        if( !leafExists(branch, supplier.id) )
            addLeafToBranch(branch, supplier.id); // Create supplier node if it does not exist yet
        let leaf = branch.children[supplier.id];
        f_branches.map( (f) => {
            if( !leafExists(f, supplier.id) )
                addLeafToBranch(f, supplier.id); // Create supplier node if it does not exist yet for funder
        } );

        let year_index = supplier.contract.year.toString();
        if( !leaf.years[year_index] )
            leaf.years[year_index] = newYearObj(); // Initialize year object for supplier if not seen yet
        if( !branch.years[year_index] )
            branch.years[year_index] = newYearObj(); // Initialize year object for buyer if not seen yet
        f_branches.map( (f) => {
            if( !f.years[year_index] )
                f.years[year_index] = newYearObj(); // Initialize year object for funders if not seen yet
            if( !f.children[supplier.id].years[year_index] )
                f.children[supplier.id].years[year_index] = newYearObj(); // Initialize year object for funder supplier if not seen yet
        } );

        // Update contract count and amount for this buyer
        branch.years[year_index].c_c++;
        branch.years[year_index].c_a += parseFloat(supplier.contract.amount);
        // Update contract count and amount for this supplier
        leaf.years[year_index].c_c++;
        leaf.years[year_index].c_a += parseFloat(supplier.contract.amount);
        // Update contract count and amount for funders
        f_branches.map( (f) => {
            f.years[year_index].c_c++;
            f.years[year_index].c_a += parseFloat(supplier.contract.amount);
            // Update contract count and amount for this supplier
            f.children[supplier.id].years[year_index].c_c++;
            f.children[supplier.id].years[year_index].c_a += parseFloat(supplier.contract.amount);
        } );


        let title_index = supplier.contract.title;
        // Update title count for this buyer
        if( !branch.years[year_index].titles[title_index] )
            branch.years[year_index].titles[title_index] = 1;
        else
            branch.years[year_index].titles[title_index]++;
        // Update title count for this supplier
        if( !leaf.years[year_index].titles[title_index] )
            leaf.years[year_index].titles[title_index] = 1;
        else
            leaf.years[year_index].titles[title_index]++;
        // Update title count for funders
        f_branches.map( (f) => {
            if( !f.years[year_index].titles[title_index] )
                f.years[year_index].titles[title_index] = 1;
            else
                f.years[year_index].titles[title_index]++;
            // Update title count for this supplier
            if( !f.children[supplier.id].years[year_index].titles[title_index] )
                f.children[supplier.id].years[year_index].titles[title_index] = 1;
            else
                f.children[supplier.id].years[year_index].titles[title_index]++;
        } );

        let amount_index = supplier.contract.amount.toString();
        // Update amount count for this buyer and amount
        if( !branch.years[year_index].amounts[amount_index] )
            branch.years[year_index].amounts[amount_index] = 1;
        else
            branch.years[year_index].amounts[amount_index]++;
        // Update amount count for this supplier and amount
        if( !leaf.years[year_index].amounts[amount_index] )
            leaf.years[year_index].amounts[amount_index] = 1;
        else
            leaf.years[year_index].amounts[amount_index]++;
        // Update amount count for funders
        f_branches.map( (f) => {
            if( !f.years[year_index].amounts[amount_index] )
                f.years[year_index].amounts[amount_index] = 1;
            else
                f.years[year_index].amounts[amount_index]++;
            // Update amount count for this supplier and amount
            if( !f.children[supplier.id].years[year_index].amounts[amount_index] )
                f.children[supplier.id].years[year_index].amounts[amount_index] = 1;
            else
                f.children[supplier.id].years[year_index].amounts[amount_index]++;
        } );

        if( data.procMethod == 'direct' || data.procMethod == 'limited' ) {
            // Update direct procurement count and amount for this buyer
            branch.years[year_index].direct.c_c++;
            branch.years[year_index].direct.c_a += parseFloat(supplier.contract.amount);

            // Update direct procurement count and amount for this supplier
            leaf.years[year_index].direct.c_c++;
            leaf.years[year_index].direct.c_a += parseFloat(supplier.contract.amount);

            // Update direct procurement count and amount for funders
            f_branches.map( (f) => {
                f.years[year_index].direct.c_c++;
                f.years[year_index].direct.c_a += parseFloat(supplier.contract.amount);

                // Update direct procurement count and amount for this supplier
                f.children[supplier.id].years[year_index].direct.c_c++;
                f.children[supplier.id].years[year_index].direct.c_a += parseFloat(supplier.contract.amount);
            } );
        }

        let date_index = supplier.contract.date;
        // Finally, update the date counter for the buyer
        if( !branch.years[year_index].dates[date_index] )
            branch.years[year_index].dates[date_index] = 1;
        else
            branch.years[year_index].dates[date_index]++;
        // And update the date counter for the buyer
        f_branches.map( (f) => {
            if( !f.years[year_index].dates[date_index] )
                f.years[year_index].dates[date_index] = 1;
            else
                f.years[year_index].dates[date_index]++;
        } );

        branch.children[supplier.id] = leaf;
    } );

    roots[data.ucID] = branch;
}


/* ------------------------------------------------------------------------------- */
/* ------------------------------ PRIVATE FUNCTIONS ------------------------------ */
/* ------------------------------------------------------------------------------- */

function extractDataFromContract(contract) {
    let dependency_id = '';
    let uc_id = '';
    let proc_method = contract.tender.procurementMethod;
    let suppliers = [];
    let funders = [];

    contract.parties.map( (p) => {
        let role = p.roles[0];
        if(role == 'buyer') {
            uc_id = p.id;
            dependency_id = p.memberOf[0].id;
        }
        if(role == 'funder') {
            funders.push(p.id);
        }
    } );

    contract.contracts.map( (c) => {
        let date = c.hasOwnProperty('dateSigned')? c.dateSigned : c.period.startDate;
        let date_parts = processDate(date);
        let c_summary = {
            year: date_parts[0].toString(),
            date: date_parts[1] + '-' + date_parts[2],
            title: c.title,
            amount: parseFloat(c.value.amount)
        }
        let supplier_ids = getSupplierIDs(contract.awards, c.awardID);
        supplier_ids.map( (s) => {
            if(s.id)
                suppliers.push( { id: s.id, contract: c_summary } );
        } )
    } );

    return {
        dependencyID: dependency_id,
        ucID: uc_id,
        procmethod: proc_method,
        suppliers: suppliers,
        funders: funders
    }
}

function getSupplierIDs(awards, awardID) {
    let award = awards.filter( (a) => a.id == awardID );
    return award[0].suppliers;
}

function addBranch(roots, branch_id, parent_id) {
    roots[branch_id] = {
        id: branch_id,
        parent_id: parent_id,
        children: {},
        years: {}
    }
}

function addLeafToBranch(branch, child_id) {
    branch.children[child_id] = {
        id: child_id,
        years: {}
    }
}

function newYearObj() {
    return {
        c_c: 0,
        c_a: 0,
        titles: {},
        amounts: {},
        dates: {},
        direct: {
            c_c: 0,
            c_a: 0
        }
    }
}

function branchExists(roots, branch_id) {
    if( roots[branch_id] ) return true;
    else return false;
}

function leafExists(branch, leaf_id) {
    if( branch[leaf_id] ) return true;
    else return false;
}

function processDate(date) {
    if(isDate(date)) date_str = date.toISOString();
    else date_str = date;

    if(date_str.indexOf('T')) dayDate = date_str.split('T')[0];
    else dayDate = date_str;

    let date_parts = dayDate.split(/[\/-]/);
    return date_parts;
}

function isDate(d) {
    return typeof d.toISOString === "function";
}

module.exports = { createOrgTree, updateOrgTree }
