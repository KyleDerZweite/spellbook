export default function SearchPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">
        🔮 Spellbook Card Search
      </h1>
      <div className="max-w-2xl mx-auto">
        <div className="bg-background-secondary border border-border-DEFAULT rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Welcome to Spellbook!</h2>
          <p className="text-text-secondary mb-4">
            Your card collection management platform is ready for development.
          </p>
          <div className="grid gap-2 text-sm">
            <div>✅ Backend API with FastAPI</div>
            <div>✅ Frontend with Next.js 14</div>
            <div>✅ Database models and migrations</div>
            <div>✅ Authentication system</div>
            <div>✅ Development environment</div>
          </div>
          <div className="mt-6 p-4 bg-background-tertiary rounded-lg">
            <h3 className="font-medium mb-2">Next Steps:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-text-secondary">
              <li>Run database migrations</li>
              <li>Implement card search UI</li>
              <li>Add collection management</li>
              <li>Build authentication pages</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}