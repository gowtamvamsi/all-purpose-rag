import os
import sys
from google.cloud import firestore
from google.oauth2 import service_account

# Adjust path to find backend modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

def main():
    key_path = os.path.join(os.path.dirname(__file__), "service-account-key.json")
    if not os.path.exists(key_path):
        print(f"Error: Credentials not found at {key_path}")
        return
        
    creds = service_account.Credentials.from_service_account_file(key_path)
    db = firestore.Client(project='omnibase-grid-99124', credentials=creds)
    
    # Check tasks
    tasks = db.collection('tasks').get()
    print(f"--- FIRESTORE TASKS ({len(tasks)} total) ---")
    status_counts = {}
    pending_examples = []
    for t in tasks:
        data = t.to_dict()
        status = data.get('status', 'unknown')
        status_counts[status] = status_counts.get(status, 0) + 1
        if status == 'pending' and len(pending_examples) < 5:
            pending_examples.append((t.id, data.get('document_id'), data.get('page_number'), data.get('required_hardware')))
    
    print("Statuses:", status_counts)
    print("Pending Examples (first 5):")
    for pe in pending_examples:
        print(f"  Task ID: {pe[0]}, Doc ID: {pe[1]}, Page: {pe[2]}, Req Hardware: {pe[3]}")
        
    # Check workers
    workers = db.collection('workers').get()
    print(f"\n--- ACTIVE WORKERS ({len(workers)} total) ---")
    for w in workers:
        data = w.to_dict()
        print(f"  Worker: {w.id}, Type: {data.get('worker_type')}, Hardware: {data.get('hardware')}, Updated At: {data.get('updated_at')}")

if __name__ == "__main__":
    main()
