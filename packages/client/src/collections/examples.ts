/**
 * Examples demonstrating the Collections Framework.
 *
 * These examples show how to use the collections framework
 * with various compositions of behaviors.
 */

import {
  arrayList,
  arrayDeque,
  hashMap,
  // compose,
  // boundedList,
  // eventedList,
  // eventedMap,
  readonly,
  // safeList,
  // synchronized,
  emptyList,
  singletonList,
  nCopies,
  range,
  listOf,
  mapOf,
  groupBy,
  // isSome,
  // isNone,
} from "./index";

// ============================================================================
// Example 1: Basic ArrayList usage
// ============================================================================

export function basicListExample() {
  console.log("=== Basic ArrayList Example ===");

  const list = arrayList<number>();
  list.add(1);
  list.add(2);
  list.add(3);

  console.log("Size:", list.size); // 3
  console.log("Get(1):", list.get(1)); // 2
  console.log("Contains 2:", list.contains(2)); // true

  list.push(4);
  list.unshift(0);
  console.log("Array:", list.toArray()); // [0, 1, 2, 3, 4]

  list.sort((a, b) => b - a);
  console.log("Sorted desc:", list.toArray()); // [4, 3, 2, 1, 0]
}

// ============================================================================
// Example 2: Bounded + Evented List
// ============================================================================

// NOTE: Composition examples temporarily disabled pending middleware type improvements
/*
export function boundedEventedListExample() {
  console.log("\n=== Bounded + Evented List Example ===");

  const list = compose(
    eventedList<number>(),
    boundedList<number>({
      capacity: 3,
      policy: "drop-oldest",
      onOverflow: ({ newElement, currentSize }) => {
        console.log(`Overflow! Adding ${newElement}, size: ${currentSize}`);
      },
    })
  )(arrayList<number>());

  // Listen to events
  list.on("add", ({ value }) => {
    console.log(`Event: Added ${value}`);
  });

  // Add elements
  list.add(1); // Event: Added 1
  list.add(2); // Event: Added 2
  list.add(3); // Event: Added 3
  list.add(4); // Overflow! Drops 1, adds 4

  console.log("Final list:", list.toArray()); // [2, 3, 4]
  console.log("Is full?", list.isFull); // true
  console.log("Remaining capacity:", list.remainingCapacity); // 0
}
*/

// ============================================================================
// Example 3: Safe List (Option-based error handling)
// ============================================================================

// NOTE: Composition examples temporarily disabled pending middleware type improvements
/*
export function safeListExample() {
  console.log("\n=== Safe List Example ===");

  const list = compose(safeList<number>())(arrayList([10, 20, 30]));

  // Safe get returns Option
  const value1 = list.safe.get(1);
  if (isSome(value1)) {
    console.log("Value at index 1:", value1.value); // 20
  }

  const value2 = list.safe.get(10);
  if (isNone(value2)) {
    console.log("Index 10 is out of bounds"); // This prints
  }

  // Safe pop
  const popped = list.safe.pop();
  if (isSome(popped)) {
    console.log("Popped:", popped.value); // 30
  }
}
*/

// ============================================================================
// Example 4: HashMap with custom equality
// ============================================================================

export function hashMapExample() {
  console.log("\n=== HashMap Example ===");

  interface User {
    id: number;
    name: string;
  }

  const map = hashMap<User, string>({
    keyEq: (a, b) => a.id === b.id,
    keyHash: (u) => u.id,
  });

  const alice: User = { id: 1, name: "Alice" };
  const bob: User = { id: 2, name: "Bob" };

  map.set(alice, "Engineer");
  map.set(bob, "Designer");

  // Can look up with different object with same id
  const aliceClone: User = { id: 1, name: "Alice Clone" };
  console.log("Alice's role:", map.get(aliceClone)); // "Engineer"

  console.log("Size:", map.size); // 2
  console.log("Has Bob?", map.has(bob)); // true
}

// ============================================================================
// Example 5: Evented Map with listeners
// ============================================================================

// NOTE: Composition examples temporarily disabled pending middleware type improvements
/*
export function eventedMapExample() {
  console.log("\n=== Evented Map Example ===");

  const map = compose(eventedMap<string, number>())(hashMap<string, number>());

  map.on("set", ({ key, value, oldValue }) => {
    if (oldValue !== undefined) {
      console.log(`Updated ${key}: ${oldValue} -> ${value}`);
    } else {
      console.log(`Added ${key}: ${value}`);
    }
  });

  map.on("delete", ({ key, value }) => {
    console.log(`Deleted ${key} (was ${value})`);
  });

  map.set("score", 100); // Added score: 100
  map.set("score", 150); // Updated score: 100 -> 150
  map.delete("score"); // Deleted score (was 150)
}
*/

// ============================================================================
// Example 6: ArrayDeque (double-ended queue)
// ============================================================================

export function dequeExample() {
  console.log("\n=== ArrayDeque Example ===");

  const deque = arrayDeque<string>();

  // Add to both ends
  deque.addFirst("middle");
  deque.addFirst("front");
  deque.addLast("back");

  console.log("Array:", deque.toArray()); // ["front", "middle", "back"]

  // Use as stack (LIFO)
  deque.push("top");
  console.log("Pop:", deque.pop()); // "top"

  // Use as queue (FIFO)
  deque.offer("end");
  console.log("Poll:", deque.poll()); // "front"

  console.log("Final:", deque.toArray()); // ["middle", "back", "end"]
}

// ============================================================================
// Example 7: Readonly collections
// ============================================================================

export function readonlyExample() {
  console.log("\n=== Readonly Example ===");

  const mutableList = arrayList([1, 2, 3]);
  const readonlyList = readonly()(mutableList) as typeof mutableList;

  console.log("Get(0):", readonlyList.get(0)); // 1
  console.log("Size:", readonlyList.size); // 3

  try {
    (readonlyList as any).add(4); // This will throw
  } catch (error) {
    console.log("Error:", (error as Error).message); // "Cannot modify readonly collection"
  }

  // Immutable factories
  emptyList<number>();
  const singleton = singletonList(42);
  const copies = nCopies(5, "hello");

  console.log("Singleton:", singleton.toArray()); // [42]
  console.log("Copies:", copies.toArray()); // ["hello", "hello", "hello", "hello", "hello"]
}

// ============================================================================
// Example 8: Factory utilities
// ============================================================================

export function factoriesExample() {
  console.log("\n=== Factories Example ===");

  // Create from varargs
  const list = listOf(1, 2, 3, 4, 5);
  console.log("listOf:", list.toArray());

  // Create map
  const map = mapOf<string, number>(
    ["one", 1],
    ["two", 2],
    ["three", 3]
  );
  console.log("mapOf keys:", Array.from(map.keys()));

  // Range
  const numbers = range(0, 10, 2);
  console.log("range(0, 10, 2):", numbers.toArray()); // [0, 2, 4, 6, 8]

  // Group by
  interface Person {
    name: string;
    age: number;
  }

  const people: Person[] = [
    { name: "Alice", age: 25 },
    { name: "Bob", age: 30 },
    { name: "Charlie", age: 25 },
    { name: "David", age: 30 },
  ];

  const byAge = groupBy(people, (p) => p.age);
  console.log("People aged 25:", byAge.get(25)?.toArray());
  console.log("People aged 30:", byAge.get(30)?.toArray());
}

// ============================================================================
// Example 9: Complex composition
// ============================================================================

// NOTE: Composition examples temporarily disabled pending middleware type improvements
/*
export function complexCompositionExample() {
  console.log("\n=== Complex Composition Example ===");

  // Create a bounded, evented, safe list
  const list = compose(
    safeList<number>(),
    eventedList<number>(),
    boundedList<number>({ capacity: 5, policy: "reject" })
  )(arrayList<number>());

  // Subscribe to events
  list.on("add", ({ value }) => console.log(`Added: ${value}`));

  // Add elements safely
  for (let i = 0; i < 7; i++) {
    const added = list.add(i);
    if (!added) {
      console.log(`Rejected: ${i} (list is full)`);
    }
  }

  // Use safe operations
  const value = list.safe.get(2);
  if (isSome(value)) {
    console.log("Value at index 2:", value.value);
  }

  console.log("Final list:", list.toArray());
  console.log("Is full?", list.isFull);
}
*/

// ============================================================================
// Example 10: All behaviors together
// ============================================================================

// NOTE: Composition examples temporarily disabled pending middleware type improvements
/*
export function allBehaviorsExample() {
  console.log("\n=== All Behaviors Example ===");

  const list = compose(
    synchronized<any>(), // Thread-safe
    safeList<number>(), // Option/Result API
    eventedList<number>(), // Mutation events
    boundedList<number>({ capacity: 10, policy: "drop-oldest" }) // Capacity limit
  )(arrayList<number>());

  list.on("add", ({ value }) => console.log(`[Event] Added: ${value}`));

  // All operations are now:
  // - Thread-safe (synchronized)
  // - Size-limited (bounded)
  // - Observable (evented)
  // - Have safe alternatives (safe)

  list.add(1);
  list.add(2);
  list.add(3);

  const safeValue = list.safe.get(1);
  console.log("Safe get result:", isSome(safeValue) ? safeValue.value : "None");

  console.log("Final state:", {
    size: list.size,
    capacity: list.capacity,
    isFull: list.isFull,
    array: list.toArray(),
  });
}
*/

// ============================================================================
// Run all examples
// ============================================================================

export function runAllExamples() {
  basicListExample();
  // boundedEventedListExample(); // Disabled - pending middleware type improvements
  // safeListExample(); // Disabled - pending middleware type improvements
  hashMapExample();
  // eventedMapExample(); // Disabled - pending middleware type improvements
  dequeExample();
  readonlyExample();
  factoriesExample();
  // complexCompositionExample(); // Disabled - pending middleware type improvements
  // allBehaviorsExample(); // Disabled - pending middleware type improvements
}

// Uncomment to run examples:
// runAllExamples();
