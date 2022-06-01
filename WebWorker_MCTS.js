import * from 'http://epilog.stanford.edu/javascript/epilog.js';



// -----------
// PARAMETERS
// -----------

deadline_offset = Math.min(playclock/5, 2);   // How many seconds early we should return.       (see bestmove)
num_charges = 2;     // How many depthcharges we send down per node we explore. (see go_deep)
explore = 2;       // How much we explore vs exploit.      (see select_val)
discount_factor = 0.9;

console.log("entered webworker");

// --------------
// DO UPON CALLING
// --------------

// message object : {base_node, library, role, roles, grounded, deadline}

addEventListener('message', main_on_message);


// main function communicating with home JS file
function main_on_message(msg) {
  console.log("webworker main: ", msg[5]);
  message = msg.data;
  base_node = message[0];
  library = message[1];
  role = message[2];
  roles = message[3];
  grounded = message[4];
  dealine = message[5];
  state = base_node.state;

  if !(base_node.children && base_node.children.length > 0) {postMessage(false)};

  var charge_count = process_tree(deadline);     // Update tree using Monte Carlo until deadline.
  var response = [base_node, charge_count];
  postMessage(response);
}



// --------------
// MAIN FUNCTIONS
// --------------

function update_base_node (move, state) {
    for (var i=0; i<base_node.children.length; i++) {   // If the move is already in the tree,
        if (base_node.children[i].move === move) {    // set the base_node to the corresponding node
            base_node = base_node.children[i];
            base_node.parent = null;
            return true;
        }
    }
    base_node = new Node(state);        // If we haven't mapped the move yet, make a new base_node
}



// --------------------------
// TREE PROCESSING FUNCTIONS
// --------------------------

// Master tree processing function.
function process_tree (deadline) {
    var h = 0;
    while (Date.now()<deadline) {
        var choice_node = end_node(base_node, h);
        var total_score = 0;
        for (var i=0; i<num_charges; i++) {
            var score;
            var depth;
            [score, depth] = go_deep(choice_node.state, deadline);
            total_score += score * (discount_factor ** depth);
        }
        backpropagate(choice_node, total_score / num_charges);
        h++;
    } return h;
}

// Finds the most promising node
// to send depthcharges down from.
function end_node (node, total) {
    while (node.children.length !== 0) {
        // choose next
        var best_score = -Infinity;
        var best_node = node.children[0];

        var scores = [];
        // console.log(node.children)
        for (var i=0; i<node.children.length; i++) {    //  Loop through children, find best
            if (node.children[i].visits === 0) {  // If child not visited, pick it
                best_node = node.children[i];
                break;
            }
            var child_score = node.children[i].select_val(total);
            scores.push(child_score);
            if (child_score > best_score) {
                best_score = child_score;
                best_node = node.children[i];
            }
        }
        // console.log(scores);
        // console.log(best_score);
        node = best_node;
    }
    if (! expand(node)) {     // If it's a terminal node, expand() won't do anything.
        return node;          // There won't be any children, so the next line won't work.
    }
    return random_choice(node.children);
}

// Expand the node, duh.
function expand(node) {
  if (findterminalp(node.state, library)) {
    return false;
  }
  var actions = findlegals(node.state,library);
  for (var i=0; i<actions.length; i++) {
      var newstate = simulate(actions[i],node.state,library);
      var child = new Node(newstate, 0, 0, node, seq(), actions[i]);
      node.children.push(child);
  }
  return true
}

// Performs one depthcharge.
// Returns value of terminal state at end.
function go_deep (state, deadline) {
    var depth = 0;
    while (!findterminalp(state, library)) {
        var actions = findlegals(state, library);
        var choice = random_choice(actions);
        state = simulate(choice, state, library);
        if (depth % 8===0) {if (Date.now()>deadline) {console.log("end in depth"); break;}}
        depth++;
    }
    return [findreward(role, state, library)*1, depth];
}

// Update all the parent nodes after depthcharge.
function backpropagate (node, score) {
    while (node.parent !== null) {
        node.visits = node.visits + 1;
        node.value = node.value + score;
        node = node.parent;
    }
    return true;
  }

// Actual tree node constructor.
class Node {
  constructor(this_state, value=0, visits=0, parent=null, children=seq(), move=null) {
    this.state = this_state;
    this.value = value;
    this.visits = visits;
    this.parent = parent;
    // if (parent !== null) {parent.add_child(this)};
    this.children = children;
    this.move = move;
    this.interim_value = 0;
    this.interim_visits = 0;
  }

// Determines which path is more promising.
// var K is the exploration parameter – we can try different values.
  select_val (total, curr_role) {
    if (this.parent === null) {var parent_visits = total;}
    else {var parent_visits = this.parent.visits;}
    var exploit = this.value/this.visits;
    if (findcontrol(this.parent.state, library) !== role) { exploit *= -1 }; // In multiplayer games, pick the low score if it's your opponent's turn.
    // console.log(exploit);
    return exploit + explore * Math.sqrt(2*Math.log(Math.max(parent_visits,1))/this.visits); // change explore parameter based on how player plays
  }
}


// --------------------------------
// FIND BEST MOVE AFTER PROCESSING
// --------------------------------

function best_next_move () {
    var best_score = 0;
    var result = base_node.children[0];
    for (var i=0; i<base_node.children.length; i++) {
        var newscore = base_node.children[i].value / base_node.children[i].visits;
        if (newscore > best_score) {
            best_score = newscore;
            result = base_node.children[i];
        }
    }
    return result;
}


// --------------------
// DEBUGGING FUNCTIONS
// --------------------

// Debugger master function.
// Only need to include treelevels if tree=true.
// Only need to include node_chosen if move=true.
function debug (move=false, tree=false, treelevels,
                  sequence=false, length=false, node_chosen) {
  if (tree) { print_tree(base_node, "", "   ", treelevels) };
  if (sequence) { print_best_sequence(base_node) };
  if (length) { console.log("Tree length: ", tree_length(base_node)) };
  if (move) { console.log(node_chosen.move, node_chosen.value / node_chosen.visits) };
}

// Prints the whole tree out.
 function print_tree(node, prefix, children_prefix, levels) {
    if (levels === 0) {
        return true;
    }
    var string = node.move + " (" + node.value + ", " + node.visits + ")\n";
    console.log(prefix + string);
    extra_space = " ".repeat(Math.floor(string.length / 1.5));
    for (var i=0; i<node.children.length; i++) {
        if (i === node.children.length - 1) {
            print_tree(node.children[i], children_prefix + "|__ ", children_prefix + "    " + extra_space, levels - 1);
        } else {
            print_tree(node.children[i], children_prefix + "|-- ", children_prefix + "|   " + extra_space, levels - 1);
        }
    }
 }

// Prints the sequence of moves with the highest value.
 function print_best_sequence(node) {
    while (node.children.length !== 0) {
        var best_score = 0;
        var best_child = node.children[0];
        for (var i=0; i<node.children.length; i++) {
            if (node.children[i].value > best_score) {
                best_score = node.children[i].value;
                best_child = node.children[i];
            }
        }
        node = best_child;
        console.log(node.move);
    }
 }

// Prints the max length of the tree.
 function tree_length(node) {
    if (node.children.length === 0) {
        return 0}
    var max_length = 0;
    for (var i=0; i<node.children.length; i++) {
        child_length = tree_length(node.children[i]);
        if (child_length > max_length) {
            max_length = child_length;
        }
    }
    return max_length + 1;
 }


// Random auxiliary function.
 function random_choice (seq) {
  return seq[Math.floor(Math.random()*seq.length)];
}

//==============================================================================
// Basics
//==============================================================================

function findroles (rules)
 {if (! grounded) {return non_ground_findroles(rules)};
  return basefinds('R',seq('role','R'),seq(),rules)}

function findbases (rules)
 {if (! grounded) {return non_ground_findbases(rules)};
  return basefinds('P',seq('base','P'),seq(),rules)}

function findactions (rules)
 {if (! grounded) {return non_ground_findactions(rules)};
  return basefinds('A',seq('action','A'),seq(),rules)}

function findinits (rules)
 {if (! grounded) {return non_ground_findinits(rules)};
  return basefinds('P',seq('init','P'),seq(),rules)}

function findcontrol (facts,rules)
 {if (! grounded) {return non_ground_findcontrol(facts, rules)};
  return grounditem('control',facts,rules)}

function findlegalp (move,facts,rules)
 {if (! grounded) {return non_ground_findlegalp(move, facts, rules)};
  return groundfindp(seq('legal',move),facts,rules)}

function findlegalx (facts,rules)
 {if (! grounded) {return non_ground_findlegalx(facts, rules)};
  return grounditem('legal',facts,rules)}

function findlegals (facts,rules)
 {if (! grounded) {return non_ground_findlegals(facts, rules)};
  return grounditems('legal',facts,rules)}

function findreward (role,facts,rules)
 {if (! grounded) {return non_ground_findreward(role, facts, rules)};
  var value = groundvalue('goal',role,facts,rules);
  if (value) {return value};
  return 0}

function findterminalp (facts,rules)
 {if (! grounded) {return non_ground_findterminalp(facts, rules)};
  return groundfindp('terminal',facts,rules)}

//------------------------------------------------------
function non_ground_findroles (rules)
 {return compfinds('R',seq('role','R'),seq(),rules)}

function non_ground_findbases (rules)
 {return compfinds('P',seq('base','P'),seq(),rules)}

function non_ground_findactions (rules)
 {return compfinds('A',seq('action','A'),seq(),rules)}

function non_ground_findinits (rules)
 {return compfinds('P',seq('init','P'),seq(),rules)}

function non_ground_findcontrol (facts,rules)
 {return compfindx('X',seq('control','X'),facts,rules)}

function non_ground_findlegalp (move,facts,rules)
 {return compfindp(seq('legal',move),facts,rules)}

function non_ground_findlegalx (facts,rules)
 {return compfindx('X',seq('legal','X'),facts,rules)}

function non_ground_findlegals (facts,rules)
 {return compfinds('X',seq('legal','X'),facts,rules)}

function non_ground_findreward (role,facts,rules)
 {var value = compfindx('R',seq('goal',role,'R'),facts,rules);
  if (value) {return value};
  return 0}

function non_ground_findterminalp (facts,rules)
 {return compfindp('terminal',facts,rules)}

//------------------------------------------------------------------------------

function simulate (move,state,rules)
 {if (! grounded) {return non_ground_simulate(move,state,rules)};
  var deltas = groundexpand(move,state,rules);
  var additions = [];
  var deletions = [];
  for (var i=0; i<deltas.length; i++)
      {if (symbolp(deltas[i])) {additions.push(deltas[i]); continue};
       if (deltas[i][0]==='not') {deletions.push(deltas[i][1]); continue};
       additions.push(deltas[i])};
  var newstate = [];
  for (i = 0; i<state.length; i++)
      {if (find(state[i],additions)) {continue};
       if (find(state[i],deletions)) {continue};
       newstate.push(state[i])};
  return newstate.concat(additions)}

function non_ground_simulate (move,state,rules)
 {var deltas = compexpand(move,state,rules);
  var additions = [];
  var deletions = [];
  for (var i=0; i<deltas.length; i++)
      {if (symbolp(deltas[i])) {additions.push(deltas[i]); continue};
       if (deltas[i][0]==='not') {deletions.push(deltas[i][1]); continue};
       additions.push(deltas[i])};
  var newstate = [];
  for (i = 0; i<state.length; i++)
      {if (find(state[i],additions)) {continue};
       if (find(state[i],deletions)) {continue};
       newstate.push(state[i])};
  var outval = newstate.concat(additions);
  return outval}

//==============================================================================
// groundfindp
// grounditem
// grounditems
// groundvalue
// groundvalues
// groundexpand
//==============================================================================

function groundfindp (p,facts,rules)
 {inferences = inferences + 1;
  if (symbolp(p)) {return groundfindatom(p,facts,rules)};
  if (p[0]==='same') {return equalp(p[1],p[2])};
  if (p[0]==='distinct') {return !equalp(p[1],p[2])};
  if (p[0]==='not') {return !groundfindp(p[1],facts,rules)};
  if (groundfindbackground(p,facts,rules)) {return true};
  return groundfindrs(p,facts,rules)}

function groundcompute (rel,facts,rules)
 {var answers = seq();
  var data = facts;
  for (var i=0; i<data.length; i++)
      {if (operator(data[i])===rel) {answers.push(data[i])}};
  data = indexees(rel,rules);
  for (var i=0; i<data.length; i++)
      {if (symbolp(data[i])) {if (equalp(data[i],rel)) {answers.push(rel)}}
       else if (data[i][0]!=='rule')
               {if (equalp(operator(data[i]),rel)) {answers.push(data[i])}}
       else {if (equalp(operator(data[i]),rel) &&
                 groundfindsubs(data[i],facts,rules))
                {answers.push(data[i][1])}}};
  return uniquify(answers)}

function groundfindatom (p,facts,rules)
 {if (p==='true') {return true};
  if (p==='false') {return false};
  if (groundfindbackground(p,facts,rules)) {return true};
  return groundfindrs(p,facts,rules)}

function groundfindbackground (p,facts,rules)
 {//var data = factindexps(p,facts);
  data = facts;
  for (var i=0; i<data.length; i++)
      {if (equalp(data[i],p)) {return true}};
  return false}

function groundfindrs (p,facts,rules)
 {var data = viewindexps(p,rules);
  for (var i=0; i<data.length; i++)
      {if (symbolp(data[i])) {if (equalp(data[i],p)) {return true}}
       else if (data[i][0]!=='rule') {if (equalp(data[i],p)) {return true}}
       else {if (equalp(data[i][1],p) && groundfindsubs(data[i],facts,rules))
                {return true}}};
  return false}

function groundfindsubs (rule,facts,rules)
 {for (var j=2; j<rule.length; j++)
      {if (!groundfindp(rule[j],facts,rules)) {return false}};
  return true}

function factindexps (p,theory)
 {if (symbolp(p)) {return indexees(p,theory)};
  var best = indexees(p[0],theory);
  for (var i=1; i<p.length; i++)
      {var dum = factindexps(p[i],theory);
       if (dum.length<best.length) {best = dum}};
  return best}

//------------------------------------------------------------------------------

function grounditem (rel,facts,rules)
 {var data = facts;
  for (var i=0; i<data.length; i++)
      {if (symbolp(data[i])) {continue}
       else if (data[i][0]===rel) {return data[i][1]}};
  data = indexees(rel,rules);
  for (var i=0; i<data.length; i++)
      {if (symbolp(data[i])) {continue}
       else if (data[i][0]!=='rule')
               {if (data[i][0]===rel) {return data[i][1]}}
       else {var head = data[i][1];
             if (operator(head)===rel &&
                 groundfindsubs(data[i],facts,rules))
                {return (head[1])}}};
  return false}

function grounditems (rel,facts,rules)
 {var answers=seq();
  var data = facts;
  for (var i=0; i<data.length; i++)
      {if (symbolp(data[i])) {continue}
       else if (data[i][0]===rel)
               {answers.push(data[i][1])}};
  data = indexees(rel,rules);
  for (var i=0; i<data.length; i++)
      {if (symbolp(data[i])) {continue}
       else if (data[i][0]!=='rule')
               {if (data[i][0]===rel)
                   {answers.push(data[i][1])}}
       else {var head=data[i][1];
             if (operator(head)===rel &&
                 groundfindsubs(data[i],facts,rules))
                {answers.push(head[1])}}};
  return uniquify(answers)}

function groundvalue (rel,obj,facts,rules)
 {var data = facts;
  for (var i=0; i<data.length; i++)
      {if (symbolp(data[i])) {continue}
       else if (data[i][0]===rel && data[i][1]===obj) {return data[i][2]}};
  data = indexees(rel,rules);
  for (var i=0; i<data.length; i++)
      {if (symbolp(data[i])) {continue}
       else if (data[i][0]!=='rule')
               {if (data[i][0]===rel && data[i][1]===obj) {return data[i][2]}}
       else {var head=data[i][1];
             if (operator(head)===rel && equalp(head[1],obj) &&
                 groundfindsubs(data[i],facts,rules))
                {return data[i][1][2]}}};
  return false}

function groundvalues (rel,obj,facts,rules)
 {var answers=seq();
  var data = facts;
  for (var i=0; i<data.length; i++)
      {if (symbolp(data[i])) {continue}
       else if (data[i][0]===rel && data[i][1]===obj)
               {answers.push(data[i][2])}};
  data = indexees(rel,rules);
  for (var i=0; i<data.length; i++)
      {if (symbolp(data[i])) {continue}
       else if (data[i][0]!=='rule')
               {if (data[i][0]===rel && data[i][1]===obj)
                   {answers.push(data[i][2])}}
       else {var head=data[i][1];
             if (operator(head)===rel && equalp(head[1],obj) &&
                 groundfindsubs(data[i],facts,rules))
                {answers.push(head[2])}}};
  return uniquify(answers)}

//------------------------------------------------------------------------------

function groundexpand (seed,facts,rules)
 {return zniquify(groundexpanddepth(seed,facts,rules,0))}

function groundexpanddepth (seed,facts,rules,depth)
 {if (symbolp(seed)) {return groundexpanddepthrs(seed,facts,rules,depth)};
  if (seed[0]==='not') {return [seed]};
  if (seed[0]==='and') {return groundexpanddepthand(seed,facts,rules,depth)};
  if (seed[0]==='transition') {return groundexpanddepthtransition(seed,facts,rules,depth)};
  if (depth>expanddepth) {return []};
  return groundexpanddepthrs(seed,facts,rules,depth)}

function groundexpanddepthand (seed,facts,rules,depth)
 {var updates = [];
  for (var i=1; i<seed.length; i++)
      {updates = updates.concat(groundexpanddepth(seed[i],facts,rules,depth))};
  return updates}

function groundexpanddepthtransition (seed,facts,rules,depth)
 {var updates = [];
  if (compfindp(seed[1],facts,rules))
     {updates = updates.concat(groundexpanddepth(seed[2],facts,rules,depth))};
  return updates}

function groundexpanddepthrs (seed,facts,rules,depth)
 {var data = indexees('handler',rules);
  var flag = false;
  var updates = [];
  for (var i=0; i<data.length; i++)
      {if (symbolp(data[i])) {continue};
       if (data[i][0]!=='handler') {continue};
       if (equalp(data[i][1],seed))
          {flag = true;
           var rule = data[i][2];
           updates = updates.concat(groundexpanddepth(rule,facts,rules,depth+1))}};
  if (flag) {return updates};
  return [seed]}
