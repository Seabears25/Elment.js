Get full Documentation: https://jlws-55a90.web.app/elment

Elment.js is a lightweight, component-driven framework for dynamically generating and rendering HTML using JavaScript. It provides a modular structure, allowing you to build reusable UI components while keeping your code clean, scalable, and maintainable.

Unlike traditional templating engines like Pug or Handlebars, Elment.js focuses on a programmatic approach to HTML generation, making it ideal for:

Server-side rendering (SSR) for fast page loads
Component-based architecture for scalable projects
Dynamic content handling for web applications
Lightweight and dependency-free

1. Why Use Elment.js?
Component-Based Architecture
Elment.js treats every part of your UI as a component. You can create reusable components (e.g., Navbar, Footer, Card) and dynamically render them when needed.

Making modulated rendering easier and faster
Prebuild commands that allow you to just throw in whatever structure you'd like while useing shorhanded methods to return a large scale file structured server.Easy to maintain code, and write however you feel comforatble.

Dynamic Rendering & Conditional Logic
With built-in functions like _.if(), _.switch(), and _.for(), you can conditionally render elements, loop through data, and create dynamic layouts with ease.

Works with Any Backend
Elment.js is designed to work seamlessly with Node.js, Express, or any other backend framework. Since it generates raw HTML, you can use it anywhere you’d normally use a templating engine.

2. How Does It Work?
Elment.js converts JavaScript function calls into HTML elements, making it easy to create structured layouts.

Example: Without Elment.js
Traditional way (string-based HTML rendering):

   const html = `
    <div class="container">
        <h1>Welcome</h1>
        <p>'Hello, User!'</p>
    </div>
    `
                            
Example: With Elment.js
Clean & structured approach using Elment.js:


    const html = _.div('class="container"', [
        _.h1('', 'Welcome'),
        _.p('', 'Hello, User!')
    ]);
                
This results in:


    <div class="container">
        <h1>Welcome</h1>
        <p>'Hello, User!'</p>
    </div>
                            
3. Core Features of Elment.js
Features
Description
Component System
Build reusable UI components using _.renderComponent()
Dynamic Rendering
Use _.if(), _.switch(), and _.for() for conditional and iterative rendering
Fast & Lightweight
No dependencies, optimized for performance
Shorthand Functions
Use _.div(), _.p(), _.button(), etc., for clean code
Works Anywhere
Compatible with Express, REST APIs, and static HTML pages
5. Getting Started with Elment.js
Step 1: Install Elment.js
Simply clone the repository and require the framework in your project:

    const _ = require('./elment');
                
Step 2: Create Your First Component
Define a Navbar component (components/navbar.js):


    module.exports = {
        render: () => {
            return _.nav('class="navbar"', [
                _.a('href="/"', 'Home'),
                _.a('href="/about"', 'About'),
                _.a('href="/contact"', 'Contact')
            ]);
        }
    };
                
Step 3: Render It in Your App
Modify server.js to render the component:


    const express = require('express');
    const _ = require('./elment');

    const app = express();
    app.use(express.static('public'));

    // Auto-load all components
    _.autoloadComponents('components');

    app.get('/', (req, res) => {
        const context = {
            title: 'Home Page',
            content: _.renderComponent('navbar')
        };

        res.send(_.render(context));
    });

    app.listen(3000, () => console.log('Server running on http://localhost:3000'));
                
5. What’s Next?
Now that you’ve set up Elment.js, explore its powerful features:

Nested Components – Build complex UI structures
Dynamic Content – Pass data to components
Filtering & Looping – Use _.where() and _.for() for data-driven UI
Conditional Rendering – Use _.if() and _.switch() for dynamic pages
Ready to Build?
Start using Elment.js today to simplify HTML rendering, improve reusability, and make your web projects more scalable!
