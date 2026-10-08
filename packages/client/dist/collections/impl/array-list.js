/**
 * ArrayList implementation - A dynamic array-backed list.
 *
 * Provides O(1) indexed access and amortized O(1) append.
 * Mirrors java.util.ArrayList.
 *
 * @example
 * const list = arrayList<number>()
 * list.add(1)
 * list.add(2)
 * list.add(3)
 * console.log(list.get(1)) // 2
 */
import { defaultEq, defaultCompare } from "../utils/defaults.js";
/**
 * ArrayList<T> - Resizable array implementation of the List interface.
 *
 * Provides fast random access (O(1)) and fast append (amortized O(1)).
 * Insertion and removal in the middle require shifting elements (O(n)).
 *
 * This is the most commonly used list implementation.
 */
export class ArrayList {
    _array;
    _size;
    _eq;
    supportsRandomAccess = true;
    constructor(options = {}) {
        const { initialCapacity = 10, eq = defaultEq } = options;
        this._array = new Array(initialCapacity);
        this._size = 0;
        this._eq = eq;
    }
    // ========================================================================
    // Size and capacity
    // ========================================================================
    get size() {
        return this._size;
    }
    get isEmpty() {
        return this._size === 0;
    }
    /**
     * Current capacity of the underlying array.
     */
    get capacity() {
        return this._array.length;
    }
    get eq() {
        return this._eq;
    }
    // ========================================================================
    // Indexed access
    // ========================================================================
    get(index) {
        this.checkIndex(index);
        return this._array[index];
    }
    set(index, element) {
        this.checkIndex(index);
        const old = this._array[index];
        this._array[index] = element;
        return old;
    }
    // ========================================================================
    // Search
    // ========================================================================
    contains(element) {
        return this.indexOf(element) !== -1;
    }
    indexOf(element, fromIndex = 0) {
        if (fromIndex < 0)
            fromIndex = 0;
        for (let i = fromIndex; i < this._size; i++) {
            if (this._eq(this._array[i], element)) {
                return i;
            }
        }
        return -1;
    }
    lastIndexOf(element, fromIndex) {
        const start = fromIndex !== undefined
            ? Math.min(fromIndex, this._size - 1)
            : this._size - 1;
        for (let i = start; i >= 0; i--) {
            if (this._eq(this._array[i], element)) {
                return i;
            }
        }
        return -1;
    }
    containsAll(other) {
        for (const element of other) {
            if (!this.contains(element))
                return false;
        }
        return true;
    }
    // ========================================================================
    // Addition
    // ========================================================================
    add(element) {
        this.ensureCapacity(this._size + 1);
        this._array[this._size++] = element;
        return true;
    }
    push(element) {
        this.add(element);
    }
    unshift(element) {
        this.insert(0, element);
    }
    insert(index, element) {
        this.checkInsertIndex(index);
        this.ensureCapacity(this._size + 1);
        // Shift elements to the right
        for (let i = this._size; i > index; i--) {
            this._array[i] = this._array[i - 1];
        }
        this._array[index] = element;
        this._size++;
    }
    insertAll(index, other) {
        this.checkInsertIndex(index);
        const elements = Array.isArray(other) ? other : Array.from(other);
        if (elements.length === 0)
            return false;
        this.ensureCapacity(this._size + elements.length);
        // Shift existing elements to the right
        for (let i = this._size - 1; i >= index; i--) {
            this._array[i + elements.length] = this._array[i];
        }
        // Insert new elements
        for (let i = 0; i < elements.length; i++) {
            this._array[index + i] = elements[i];
        }
        this._size += elements.length;
        return true;
    }
    addAll(other) {
        const elements = Array.isArray(other) ? other : Array.from(other);
        if (elements.length === 0)
            return false;
        this.ensureCapacity(this._size + elements.length);
        for (const element of elements) {
            this._array[this._size++] = element;
        }
        return true;
    }
    // ========================================================================
    // Removal
    // ========================================================================
    remove(element) {
        const index = this.indexOf(element);
        if (index === -1)
            return false;
        this.removeAt(index);
        return true;
    }
    removeAt(index) {
        this.checkIndex(index);
        const old = this._array[index];
        // Shift elements to the left
        for (let i = index; i < this._size - 1; i++) {
            this._array[i] = this._array[i + 1];
        }
        this._size--;
        // Clear the last element to allow GC
        this._array[this._size] = undefined;
        return old;
    }
    pop() {
        if (this.isEmpty) {
            throw new Error("Cannot pop from empty list");
        }
        return this.removeAt(this._size - 1);
    }
    shift() {
        if (this.isEmpty) {
            throw new Error("Cannot shift from empty list");
        }
        return this.removeAt(0);
    }
    removeRange(fromIndex, toIndex) {
        this.checkRange(fromIndex, toIndex);
        const numToRemove = toIndex - fromIndex;
        if (numToRemove === 0)
            return;
        // Shift elements to the left
        for (let i = toIndex; i < this._size; i++) {
            this._array[i - numToRemove] = this._array[i];
        }
        // Clear removed elements
        for (let i = this._size - numToRemove; i < this._size; i++) {
            this._array[i] = undefined;
        }
        this._size -= numToRemove;
    }
    removeAll(other) {
        const toRemove = new Set();
        for (const element of other) {
            toRemove.add(element);
        }
        let writeIndex = 0;
        let modified = false;
        for (let readIndex = 0; readIndex < this._size; readIndex++) {
            const element = this._array[readIndex];
            let shouldRemove = false;
            // Check if element matches any in toRemove using custom equality
            for (const removeElement of toRemove) {
                if (this._eq(element, removeElement)) {
                    shouldRemove = true;
                    modified = true;
                    break;
                }
            }
            if (!shouldRemove) {
                this._array[writeIndex++] = element;
            }
        }
        // Clear remaining elements
        for (let i = writeIndex; i < this._size; i++) {
            this._array[i] = undefined;
        }
        this._size = writeIndex;
        return modified;
    }
    retainAll(other) {
        const toRetain = Array.from(other);
        let writeIndex = 0;
        let modified = false;
        for (let readIndex = 0; readIndex < this._size; readIndex++) {
            const element = this._array[readIndex];
            let shouldRetain = false;
            // Check if element matches any in toRetain using custom equality
            for (const retainElement of toRetain) {
                if (this._eq(element, retainElement)) {
                    shouldRetain = true;
                    break;
                }
            }
            if (shouldRetain) {
                this._array[writeIndex++] = element;
            }
            else {
                modified = true;
            }
        }
        // Clear remaining elements
        for (let i = writeIndex; i < this._size; i++) {
            this._array[i] = undefined;
        }
        this._size = writeIndex;
        return modified;
    }
    clear() {
        // Clear all elements to allow GC
        for (let i = 0; i < this._size; i++) {
            this._array[i] = undefined;
        }
        this._size = 0;
    }
    // ========================================================================
    // Ordering
    // ========================================================================
    sort(compare = defaultCompare) {
        // Sort only the used portion of the array
        const slice = this._array.slice(0, this._size);
        slice.sort(compare);
        for (let i = 0; i < this._size; i++) {
            this._array[i] = slice[i];
        }
    }
    reverse() {
        let left = 0;
        let right = this._size - 1;
        while (left < right) {
            const temp = this._array[left];
            this._array[left] = this._array[right];
            this._array[right] = temp;
            left++;
            right--;
        }
    }
    // ========================================================================
    // Views
    // ========================================================================
    first() {
        if (this.isEmpty) {
            throw new Error("List is empty");
        }
        return this._array[0];
    }
    last() {
        if (this.isEmpty) {
            throw new Error("List is empty");
        }
        return this._array[this._size - 1];
    }
    subList(fromIndex, toIndex) {
        this.checkRange(fromIndex, toIndex);
        // For now, return a copy. Later we can implement a view.
        const sub = new ArrayList({ eq: this._eq });
        for (let i = fromIndex; i < toIndex; i++) {
            sub.add(this._array[i]);
        }
        return sub;
    }
    // ========================================================================
    // Iteration
    // ========================================================================
    *[Symbol.iterator]() {
        for (let i = 0; i < this._size; i++) {
            yield this._array[i];
        }
    }
    forEach(action) {
        for (let i = 0; i < this._size; i++) {
            action(this._array[i], i);
        }
    }
    toArray() {
        return this._array.slice(0, this._size);
    }
    // ========================================================================
    // Capacity management
    // ========================================================================
    /**
     * Ensures that the capacity is at least the specified minimum.
     */
    ensureCapacity(minCapacity) {
        if (minCapacity <= this._array.length)
            return;
        // Grow by 1.5x or to minCapacity, whichever is larger
        const newCapacity = Math.max(minCapacity, Math.floor(this._array.length * 1.5) + 1);
        const newArray = new Array(newCapacity);
        for (let i = 0; i < this._size; i++) {
            newArray[i] = this._array[i];
        }
        this._array = newArray;
    }
    /**
     * Trims the capacity to the current size to minimize memory usage.
     */
    trimToSize() {
        if (this._size < this._array.length) {
            this._array = this._array.slice(0, this._size);
        }
    }
    // ========================================================================
    // Private helpers
    // ========================================================================
    checkIndex(index) {
        if (index < 0 || index >= this._size) {
            throw new RangeError(`Index ${index} out of bounds for size ${this._size}`);
        }
    }
    checkInsertIndex(index) {
        if (index < 0 || index > this._size) {
            throw new RangeError(`Index ${index} out of bounds for insert (size ${this._size})`);
        }
    }
    checkRange(fromIndex, toIndex) {
        if (fromIndex < 0 || toIndex > this._size || fromIndex > toIndex) {
            throw new RangeError(`Invalid range [${fromIndex}, ${toIndex}) for size ${this._size}`);
        }
    }
}
/**
 * Factory function to create an ArrayList.
 *
 * @example
 * const list = arrayList<number>()
 * const listWithEq = arrayList<User>({ eq: (a, b) => a.id === b.id })
 * const listFromArray = arrayList([1, 2, 3])
 */
export function arrayList(optionsOrElements) {
    // Check if it's an iterable (not options)
    if (optionsOrElements && Symbol.iterator in optionsOrElements) {
        const list = new ArrayList();
        list.addAll(optionsOrElements);
        return list;
    }
    const list = new ArrayList(optionsOrElements);
    return list;
}
//# sourceMappingURL=array-list.js.map